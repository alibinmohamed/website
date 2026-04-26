from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from extensions import db
from models.progress import Progress
from models.member import Member
from network_tasks import (
    NETWORK_TASKS, xp_for as network_xp_for,
    all_task_ids as network_all_ids,
    public_catalogue as network_public_catalogue,
    TOTAL_XP as NETWORK_TOTAL_XP,
)
from web_tasks import (
    WEB_TASKS, xp_for as web_xp_for,
    all_task_ids as web_all_ids,
    public_catalogue as web_public_catalogue,
    TOTAL_XP as WEB_TOTAL_XP,
)
from ethics_quiz import (
    ETHICS_QUIZ, xp_for as ethics_xp_for,
    all_question_ids as ethics_all_ids,
    public_catalogue as ethics_public_catalogue,
    answer_feedback as ethics_answer_feedback,
    chapter_of as ethics_chapter_of,
    TOTAL_XP as ETHICS_TOTAL_XP,
)
from crypto_tasks import (
    CRYPTO_TASKS, xp_for as crypto_xp_for,
    all_task_ids as crypto_all_ids,
    public_catalogue as crypto_public_catalogue,
    TOTAL_XP as CRYPTO_TOTAL_XP,
)
from pentest_tasks import (
    PENTEST_TASKS, xp_for as pentest_xp_for,
    all_task_ids as pentest_all_ids,
    public_catalogue as pentest_public_catalogue,
    TOTAL_XP as PENTEST_TOTAL_XP,
)

progress_bp = Blueprint("progress", __name__)

# XP per task (mirrors the frontend modules in linux-lab.js)
LINUX_TASKS_XP = {
    1: 10, 2: 10, 3: 10,           # Module 1 — Orientation & Identity
    4: 15, 5: 10, 6: 10, 7: 10,    # Module 2 — Navigation & Paths
    8: 15, 9: 15, 10: 15, 11: 10, 12: 15,  # Module 3 — Workspace Setup
    13: 10, 14: 20, 15: 10, 16: 15,  # Module 4 — Reading & Managing Files
    17: 15, 18: 15, 19: 20, 20: 20, 21: 20, 22: 15, 23: 15,  # Module 5 — Discovery & Search
    24: 10, 25: 5, 26: 5,           # Module 6 — Permissions & Execution
    27: 10, 28: 10, 29: 10,         # Module 7 — Archives & Portability
    30: 15, 31: 10, 32: 10,         # Module 8 — Mission Preparation
    33: 10, 34: 15,                 # Module 9 — Capstone Gate
}
MAX_TASK_ID = 34


def _calculate_xp(task_ids: list) -> int:
    return sum(LINUX_TASKS_XP.get(int(t), 0) for t in task_ids)


@progress_bp.route("", methods=["GET"])
@jwt_required()
def get_progress():
    """Return the logged-in member's Linux progress."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    prog = Progress.query.filter_by(member_id=member_id, course="linux").first()

    if not prog:
        # Auto-create if missing
        prog = Progress(member_id=member_id, course="linux")
        prog.completed_tasks = []
        db.session.add(prog)
        db.session.commit()

    return jsonify(prog.to_dict()), 200


@progress_bp.route("/flag", methods=["POST"])
@jwt_required()
def submit_flag():
    """
    Validate and record the final lab flag submission.
    Accepts: { flag: "UTB{...}" }
    Returns: { correct: bool, message: str }
    """
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"correct": False, "error": "Admins cannot submit flags"}), 403

    member_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    submitted = (data.get("flag") or "").strip()

    CORRECT_FLAG = "UTB{linux_foundations_mastered}"

    if submitted == CORRECT_FLAG:
        prog = Progress.query.filter_by(member_id=member_id, course="linux").first()
        if not prog:
            prog = Progress(member_id=member_id, course="linux")
            db.session.add(prog)
        prog.lab_completed = True
        db.session.commit()
        return jsonify({
            "correct": True,
            "message": "🏆 Flag accepted! Operation Nightfall complete. +50 XP awarded."
        }), 200
    else:
        return jsonify({
            "correct": False,
            "message": "❌ Incorrect flag. Keep investigating — check your extracted files."
        }), 200


@progress_bp.route("", methods=["PUT"])
@jwt_required()
def update_progress():
    """
    Update the logged-in member's progress.
    Accepts: { completedTasks: [1,2,3,...], labCompleted: bool }
    Server recalculates XP from the canonical task list.
    """
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    completed_tasks = data.get("completedTasks", [])
    lab_completed   = bool(data.get("labCompleted", False))

    # Validate task IDs
    valid_tasks = [t for t in completed_tasks if isinstance(t, int) and 1 <= t <= MAX_TASK_ID]
    total_xp    = _calculate_xp(valid_tasks)

    prog = Progress.query.filter_by(member_id=member_id, course="linux").first()
    if not prog:
        prog = Progress(member_id=member_id, course="linux")
        db.session.add(prog)

    prog.completed_tasks = valid_tasks
    prog.total_xp        = total_xp
    prog.lab_completed   = lab_completed
    db.session.commit()

    # Also sync denormalised points on the member row for fast leaderboard queries
    member = Member.query.get(member_id)
    if member:
        member_data = member.to_public_dict()   # re-reads from progress
        # (no separate points column needed — to_public_dict reads from progress)

    return jsonify({
        "message":        "Progress saved",
        "completedTasks": valid_tasks,
        "totalXP":        total_xp,
        "labCompleted":   lab_completed,
    }), 200


# =========================================================================
# Network Fundamentals course
# =========================================================================
@progress_bp.route("/network", methods=["GET"])
@jwt_required()
def get_network_progress():
    """Return the logged-in member's Network Fundamentals progress."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    prog = Progress.query.filter_by(member_id=member_id, course="network").first()

    if not prog:
        prog = Progress(member_id=member_id, course="network")
        prog.completed_tasks = []
        db.session.add(prog)
        db.session.commit()

    payload = prog.to_dict()
    payload["totalPossibleXP"] = NETWORK_TOTAL_XP
    return jsonify(payload), 200


@progress_bp.route("/network", methods=["PUT"])
@jwt_required()
def update_network_progress():
    """
    Accepts: { completedTasks: [...] }. Intended mainly for reconciling
    localStorage progress into the DB on first login; the WebSocket handler
    is the primary write path.
    """
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    completed_tasks = data.get("completedTasks", [])

    valid_ids = set(network_all_ids())
    valid_tasks = sorted({int(t) for t in completed_tasks
                          if isinstance(t, int) and int(t) in valid_ids})
    total_xp = network_xp_for(valid_tasks)

    prog = Progress.query.filter_by(member_id=member_id, course="network").first()
    if not prog:
        prog = Progress(member_id=member_id, course="network")
        db.session.add(prog)

    prog.completed_tasks = valid_tasks
    prog.total_xp        = total_xp
    db.session.commit()

    return jsonify({
        "message":        "Network progress saved",
        "completedTasks": valid_tasks,
        "totalXP":        total_xp,
        "totalPossibleXP": NETWORK_TOTAL_XP,
    }), 200


@progress_bp.route("/network/catalogue", methods=["GET"])
def get_network_catalogue():
    """
    Public JSON catalogue of chapters + tasks (no regex). The front-end
    renders the task checklist from this response.
    """
    return jsonify({
        "chapters":        network_public_catalogue(),
        "totalPossibleXP": NETWORK_TOTAL_XP,
    }), 200


# =========================================================================
# Web & Application Fundamentals course
# Same shape as the Network endpoints above, but reads/writes the
# Progress row with course="web". A single member can hold multiple
# Progress rows (one per course) thanks to the ``course`` column on the
# model — the new course inherits this for free.
# =========================================================================
@progress_bp.route("/web", methods=["GET"])
@jwt_required()
def get_web_progress():
    """Return the logged-in member's Web Fundamentals progress."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    prog = Progress.query.filter_by(member_id=member_id, course="web").first()

    if not prog:
        prog = Progress(member_id=member_id, course="web")
        prog.completed_tasks = []
        db.session.add(prog)
        db.session.commit()

    payload = prog.to_dict()
    payload["totalPossibleXP"] = WEB_TOTAL_XP
    return jsonify(payload), 200


@progress_bp.route("/web", methods=["PUT"])
@jwt_required()
def update_web_progress():
    """
    Accepts: { completedTasks: [...] }. Used to reconcile guest/localStorage
    progress into the DB. The WebSocket handler is the primary write path.
    """
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    completed_tasks = data.get("completedTasks", [])

    valid_ids = set(web_all_ids())
    valid_tasks = sorted({int(t) for t in completed_tasks
                          if isinstance(t, int) and int(t) in valid_ids})
    total_xp = web_xp_for(valid_tasks)

    prog = Progress.query.filter_by(member_id=member_id, course="web").first()
    if not prog:
        prog = Progress(member_id=member_id, course="web")
        db.session.add(prog)

    prog.completed_tasks = valid_tasks
    prog.total_xp        = total_xp
    db.session.commit()

    return jsonify({
        "message":        "Web progress saved",
        "completedTasks": valid_tasks,
        "totalXP":        total_xp,
        "totalPossibleXP": WEB_TOTAL_XP,
    }), 200


@progress_bp.route("/web/catalogue", methods=["GET"])
def get_web_catalogue():
    """
    Public JSON catalogue of chapters + tasks (no regex). The front-end
    renders the task checklist from this response.
    """
    return jsonify({
        "chapters":        web_public_catalogue(),
        "totalPossibleXP": WEB_TOTAL_XP,
    }), 200


# =========================================================================
# Cybersecurity Ethics & Laws course
# Same shape as the Linux/Network/Web endpoints but it's quiz-driven, not
# command-driven. The course persists into Progress rows where
# ``course="ethics"`` and ``completed_tasks`` is the list of question IDs
# the student has answered correctly.
#
# Server-side validation lives in ``POST /api/progress/ethics/answer`` so
# the catalogue can be rendered to the page without leaking the correct
# choice index.
# =========================================================================
@progress_bp.route("/ethics", methods=["GET"])
@jwt_required()
def get_ethics_progress():
    """Return the logged-in member's Cybersecurity Ethics progress."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    prog = Progress.query.filter_by(member_id=member_id, course="ethics").first()

    if not prog:
        prog = Progress(member_id=member_id, course="ethics")
        prog.completed_tasks = []
        db.session.add(prog)
        db.session.commit()

    payload = prog.to_dict()
    payload["totalPossibleXP"] = ETHICS_TOTAL_XP
    return jsonify(payload), 200


@progress_bp.route("/ethics", methods=["PUT"])
@jwt_required()
def update_ethics_progress():
    """
    Accepts: { completedTasks: [...] }. Used to reconcile guest /
    sessionStorage progress into the DB on first login.
    """
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    completed_tasks = data.get("completedTasks", [])

    valid_ids = set(ethics_all_ids())
    valid_tasks = sorted({int(t) for t in completed_tasks
                          if isinstance(t, int) and int(t) in valid_ids})
    total_xp = ethics_xp_for(valid_tasks)

    prog = Progress.query.filter_by(member_id=member_id, course="ethics").first()
    if not prog:
        prog = Progress(member_id=member_id, course="ethics")
        db.session.add(prog)

    prog.completed_tasks = valid_tasks
    prog.total_xp        = total_xp
    db.session.commit()

    return jsonify({
        "message":         "Ethics progress saved",
        "completedTasks":  valid_tasks,
        "totalXP":         total_xp,
        "totalPossibleXP": ETHICS_TOTAL_XP,
    }), 200


@progress_bp.route("/ethics/catalogue", methods=["GET"])
def get_ethics_catalogue():
    """
    Public JSON catalogue of chapters + multiple-choice questions. The
    correct-answer index and the explanations are intentionally STRIPPED
    by ``ethics_public_catalogue()`` so a curious student can't just read
    the API response to cheat.
    """
    return jsonify({
        "chapters":        ethics_public_catalogue(),
        "totalPossibleXP": ETHICS_TOTAL_XP,
    }), 200


# =========================================================================
# Cryptography course
# Same shape as the Linux / Network / Web courses: lab-driven, terminal
# scoring, ``course="crypto"`` Progress rows.
# =========================================================================
@progress_bp.route("/crypto", methods=["GET"])
@jwt_required()
def get_crypto_progress():
    """Return the logged-in member's Cryptography progress."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    prog = Progress.query.filter_by(member_id=member_id, course="crypto").first()

    if not prog:
        prog = Progress(member_id=member_id, course="crypto")
        prog.completed_tasks = []
        db.session.add(prog)
        db.session.commit()

    payload = prog.to_dict()
    payload["totalPossibleXP"] = CRYPTO_TOTAL_XP
    return jsonify(payload), 200


@progress_bp.route("/crypto", methods=["PUT"])
@jwt_required()
def update_crypto_progress():
    """Reconcile guest / sessionStorage progress on first login."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    completed_tasks = data.get("completedTasks", [])

    valid_ids = set(crypto_all_ids())
    valid_tasks = sorted({int(t) for t in completed_tasks
                          if isinstance(t, int) and int(t) in valid_ids})
    total_xp = crypto_xp_for(valid_tasks)

    prog = Progress.query.filter_by(member_id=member_id, course="crypto").first()
    if not prog:
        prog = Progress(member_id=member_id, course="crypto")
        db.session.add(prog)

    prog.completed_tasks = valid_tasks
    prog.total_xp        = total_xp
    db.session.commit()

    return jsonify({
        "message":         "Crypto progress saved",
        "completedTasks":  valid_tasks,
        "totalXP":         total_xp,
        "totalPossibleXP": CRYPTO_TOTAL_XP,
    }), 200


@progress_bp.route("/crypto/catalogue", methods=["GET"])
def get_crypto_catalogue():
    """Public catalogue of chapters + tasks (no regex)."""
    return jsonify({
        "chapters":        crypto_public_catalogue(),
        "totalPossibleXP": CRYPTO_TOTAL_XP,
    }), 200


# =========================================================================
# Penetration Testing course
# Same shape as the Linux / Network / Web / Crypto courses: lab-driven,
# terminal scoring, ``course="pentest"`` Progress rows. The largest
# course on the platform: 12 chapters x 4 tasks = 48 task ids in the
# 4101..5204 range.
# =========================================================================
@progress_bp.route("/pentest", methods=["GET"])
@jwt_required()
def get_pentest_progress():
    """Return the logged-in member's Penetration Testing progress."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    prog = Progress.query.filter_by(member_id=member_id, course="pentest").first()

    if not prog:
        prog = Progress(member_id=member_id, course="pentest")
        prog.completed_tasks = []
        db.session.add(prog)
        db.session.commit()

    payload = prog.to_dict()
    payload["totalPossibleXP"] = PENTEST_TOTAL_XP
    return jsonify(payload), 200


@progress_bp.route("/pentest", methods=["PUT"])
@jwt_required()
def update_pentest_progress():
    """Reconcile guest / sessionStorage progress on first login."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a progress record"}), 403

    member_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    completed_tasks = data.get("completedTasks", [])

    valid_ids = set(pentest_all_ids())
    valid_tasks = sorted({int(t) for t in completed_tasks
                          if isinstance(t, int) and int(t) in valid_ids})
    total_xp = pentest_xp_for(valid_tasks)

    prog = Progress.query.filter_by(member_id=member_id, course="pentest").first()
    if not prog:
        prog = Progress(member_id=member_id, course="pentest")
        db.session.add(prog)

    prog.completed_tasks = valid_tasks
    prog.total_xp        = total_xp
    db.session.commit()

    return jsonify({
        "message":         "Pentest progress saved",
        "completedTasks":  valid_tasks,
        "totalXP":         total_xp,
        "totalPossibleXP": PENTEST_TOTAL_XP,
    }), 200


@progress_bp.route("/pentest/catalogue", methods=["GET"])
def get_pentest_catalogue():
    """Public catalogue of chapters + tasks (no regex)."""
    return jsonify({
        "chapters":        pentest_public_catalogue(),
        "totalPossibleXP": PENTEST_TOTAL_XP,
    }), 200


# ----- Operation NightHawk capstone -----------------------------------------
# The desktop image hosts a small chained-SQLi + header-tampering puzzle
# that returns this flag. Submitting it here marks the pentest course's
# lab_completed flag and credits a +75 XP bonus to the leaderboard via
# Member.to_public_dict.
# ----------------------------------------------------------------------------
PENTEST_CAPSTONE_FLAG  = "UTB{nighthawk_pwned_via_sqli_chain}"
PENTEST_CAPSTONE_BONUS = 75


@progress_bp.route("/pentest/flag", methods=["POST"])
@jwt_required()
def submit_pentest_flag():
    """Validate the Operation NightHawk capstone flag.

    Body: { flag: "UTB{...}" }
    Returns:
        { correct: bool, message: str, bonusXP?: int, totalXP?: int }
    On the first correct submission this also sets
    Progress(course='pentest').lab_completed = True so the +75 XP shows
    up on the leaderboard.
    """
    import hmac

    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"correct": False, "error": "Admins cannot submit flags"}), 403

    member_id = int(get_jwt_identity())
    data      = request.get_json(silent=True) or {}
    submitted = (data.get("flag") or "").strip()

    # Constant-time compare so we don't leak the flag length / prefix.
    correct = hmac.compare_digest(submitted, PENTEST_CAPSTONE_FLAG)

    prog = Progress.query.filter_by(member_id=member_id, course="pentest").first()
    if not prog:
        prog = Progress(member_id=member_id, course="pentest")
        prog.completed_tasks = []
        db.session.add(prog)

    if not correct:
        return jsonify({
            "correct": False,
            "message": "❌ Incorrect flag. Re-check your SQLi extraction "
                       "and the X-Forwarded-For + Bearer headers.",
        }), 200

    newly_awarded = not prog.lab_completed
    prog.lab_completed = True
    db.session.commit()

    return jsonify({
        "correct":       True,
        "message":       "🏆 Flag accepted! Operation NightHawk complete."
                         + (f" +{PENTEST_CAPSTONE_BONUS} XP awarded." if newly_awarded
                            else " (Already credited earlier.)"),
        "bonusXP":       PENTEST_CAPSTONE_BONUS,
        "newlyAwarded":  newly_awarded,
        "totalXP":       prog.total_xp or 0,
    }), 200


# =========================================================================
# Course unlock chain + enrollment
# -------------------------------------------------------------------------
# Courses unlock sequentially: ethics is always available, every other
# course requires its predecessor to be 100% complete. Enrollment is a
# *separate* concept — a member only sees a course on the dashboard once
# they've explicitly enrolled, even if it's already unlocked.
#
#     ethics → linux → network → crypto → web → pentest
# =========================================================================
PREREQUISITES = {
    "ethics":  None,
    "linux":   "ethics",
    "network": "linux",
    "crypto":  "network",
    "web":     "crypto",
    "pentest": "web",
}
# Order in which the front-end should display courses.
COURSE_ORDER = ["ethics", "linux", "network", "crypto", "web", "pentest"]

# Canonical task counts — sourced from each module's all_*_ids() so we
# never drift if a chapter adds/removes a task.
COURSE_REQUIRED_TASKS = {
    "linux":   34,                       # MAX_TASK_ID for the Linux course
    "network": len(network_all_ids()),
    "web":     len(web_all_ids()),
    "ethics":  len(ethics_all_ids()),
    "crypto":  len(crypto_all_ids()),
    "pentest": len(pentest_all_ids()),
}


def _course_complete_for(member_id: int, course: str) -> bool:
    """True if the member has completed every task in ``course``."""
    prog = Progress.query.filter_by(member_id=member_id, course=course).first()
    if not prog:
        return False
    needed = COURSE_REQUIRED_TASKS.get(course)
    if not needed:
        return False
    done = len(prog.completed_tasks or [])
    return done >= needed


def _ensure_legacy_enrollments(member_id: int) -> None:
    """Auto-enroll the member in any course they already have non-empty
    progress in. Idempotent. Lets users who used the platform before this
    feature shipped keep their dashboard view unchanged."""
    from models.enrollment import Enrollment

    enrolled = {e.course for e in Enrollment.query.filter_by(member_id=member_id).all()}
    progs = Progress.query.filter_by(member_id=member_id).all()
    new_rows = []
    for p in progs:
        if p.course in enrolled:
            continue
        has_progress = bool(p.completed_tasks) or bool(getattr(p, "lab_completed", False))
        if has_progress:
            new_rows.append(Enrollment(member_id=member_id, course=p.course))
            enrolled.add(p.course)
    if new_rows:
        db.session.add_all(new_rows)
        db.session.commit()


def _enrollment_state(member_id: int) -> dict:
    """Compute {enrolled, unlocked, complete} for this member."""
    from models.enrollment import Enrollment

    enrolled = sorted({
        e.course for e in Enrollment.query.filter_by(member_id=member_id).all()
    })
    complete = [c for c in COURSE_ORDER if _course_complete_for(member_id, c)]

    unlocked = []
    for course in COURSE_ORDER:
        prereq = PREREQUISITES.get(course)
        if prereq is None or prereq in complete:
            unlocked.append(course)

    return {
        "enrolled":      enrolled,
        "unlocked":      unlocked,
        "complete":      complete,
        "order":         COURSE_ORDER,
        "prerequisites": PREREQUISITES,
    }


@progress_bp.route("/enrollments", methods=["GET"])
@jwt_required()
def get_enrollments():
    """Snapshot of the member's course-unlock state.

    Front-end calls this on every learning-hub / dashboard render to
    decide which cards to lock, which to enroll, which to show as in
    progress.
    """
    claims = get_jwt()
    if claims.get("is_admin"):
        # Admins see the full chain unlocked but nothing enrolled.
        return jsonify({
            "enrolled":      [],
            "unlocked":      list(COURSE_ORDER),
            "complete":      [],
            "order":         COURSE_ORDER,
            "prerequisites": PREREQUISITES,
        }), 200

    member_id = int(get_jwt_identity())
    _ensure_legacy_enrollments(member_id)
    return jsonify(_enrollment_state(member_id)), 200


@progress_bp.route("/enroll", methods=["POST"])
@jwt_required()
def enroll_course():
    """Enrol the logged-in member in a course.

    Body:    { course: "ethics"|"linux"|... }
    Errors:  400 unknown course, 403 prereq not met (with hint).
    Idempotent on re-enrol.
    """
    from models.enrollment import Enrollment

    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not enrol"}), 403

    member_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    course = (data.get("course") or "").strip().lower()

    if course not in PREREQUISITES:
        return jsonify({"error": f"Unknown course '{course}'"}), 400

    prereq = PREREQUISITES[course]
    if prereq and not _course_complete_for(member_id, prereq):
        return jsonify({
            "error":   "prerequisite-not-met",
            "needs":   prereq,
            "message": f"Finish the '{prereq}' course first to unlock '{course}'.",
        }), 403

    existing = Enrollment.query.filter_by(member_id=member_id, course=course).first()
    if existing:
        return jsonify({
            "message":         "Already enrolled",
            "course":          course,
            "alreadyEnrolled": True,
            **_enrollment_state(member_id),
        }), 200

    db.session.add(Enrollment(member_id=member_id, course=course))
    db.session.commit()

    return jsonify({
        "message":         f"Enrolled in {course}",
        "course":          course,
        "alreadyEnrolled": False,
        **_enrollment_state(member_id),
    }), 200


@progress_bp.route("/ethics/answer", methods=["POST"])
def submit_ethics_answer():
    """
    Validate a single multiple-choice answer.

    Body: { questionId: <int>, choiceIndex: <int 0..3> }

    Logged-in non-admin users get their progress row updated when they
    answer correctly the FIRST time. Guests can submit to learn whether
    they're correct (and see the explanation), but no progress is stored
    server-side — their browser persists guest progress in sessionStorage
    via ethics-lab.js.
    """
    data = request.get_json(silent=True) or {}
    try:
        qid = int(data.get("questionId"))
        choice = int(data.get("choiceIndex"))
    except (TypeError, ValueError):
        return jsonify({"error": "questionId and choiceIndex must be integers"}), 400

    feedback = ethics_answer_feedback(qid, choice)
    if not feedback.get("known"):
        return jsonify({"error": "Unknown question id"}), 404

    feedback["chapter"] = ethics_chapter_of(qid)

    # Try to credit a logged-in non-admin member.
    feedback["newlyAwarded"] = False
    feedback["totalXP"] = None
    try:
        from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
        try:
            verify_jwt_in_request(optional=True)
            claims = get_jwt() or {}
            identity = get_jwt_identity()
            if identity and not claims.get("is_admin") and feedback["correct"]:
                member_id = int(identity)
                prog = Progress.query.filter_by(member_id=member_id, course="ethics").first()
                if not prog:
                    prog = Progress(member_id=member_id, course="ethics")
                    prog.completed_tasks = []
                    db.session.add(prog)

                done = list(prog.completed_tasks or [])
                if qid not in done:
                    done.append(qid)
                    prog.completed_tasks = done
                    prog.total_xp = ethics_xp_for(done)
                    db.session.commit()
                    feedback["newlyAwarded"] = True
                feedback["totalXP"] = prog.total_xp
        except Exception:
            # Anonymous answer — still echo correctness back to the client.
            pass
    except ImportError:
        pass

    return jsonify(feedback), 200
