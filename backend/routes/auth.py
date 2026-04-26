from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt
from extensions import bcrypt, db
from models.member import Member

auth_bp = Blueprint("auth", __name__)


def _iso_utc(dt):
    """Serialize a datetime as an ISO-8601 string the browser will parse
    as UTC. Our DB columns hold naive UTC values (``datetime.utcnow``);
    without an explicit ``Z`` the front-end’s ``new Date(…)`` would treat
    them as *local* time and "Last seen" labels would drift by the
    viewer's UTC offset.
    """
    if dt is None:
        return None
    s = dt.isoformat()
    return s if (s.endswith("Z") or "+" in s[10:] or "-" in s[10:]) else s + "Z"


# Allowed values for the year-of-study drop-down on profile.html. Must
# stay in sync with the <option> list there. We keep the list permissive
# (also accepts empty string for "prefer not to say") and trim free-form
# text on the way in.
_VALID_YEARS = {
    "", "Year 1", "Year 2", "Year 3", "Year 4", "Postgrad",
    # Legacy values from older application records.
    "Freshman", "Sophomore", "Junior", "Senior", "Graduate",
}


COURSE_LABELS = {
    "ethics":  "Cybersecurity Ethics & Laws",
    "linux":   "Linux Fundamentals",
    "network": "Network Fundamentals",
    "crypto":  "Cryptography",
    "web":     "Web & Application Fundamentals",
    "pentest": "Penetration Testing",
}

# Per-course canonical task counts (mirrors routes/members.py).
_COURSE_TASK_TOTALS = {
    "ethics":  36, "linux": 34, "network": 37,
    "crypto":  36, "web":   36, "pentest": 48,
}


def _accepted_friend_ids(member_id: int) -> list:
    """Member IDs of every accepted friend of ``member_id``."""
    from models.friend_request import FriendRequest

    rows = FriendRequest.query.filter(
        FriendRequest.status == "accepted",
        ((FriendRequest.from_id == member_id) | (FriendRequest.to_id == member_id)),
    ).all()
    ids = []
    for r in rows:
        ids.append(r.to_id if r.from_id == member_id else r.from_id)
    # De-dup just in case the table ever ends up with two rows.
    return list(dict.fromkeys(ids))


def _are_friends(a_id: int, b_id: int) -> bool:
    if a_id == b_id:
        return True
    return b_id in _accepted_friend_ids(a_id)


def _friend_brief(member: Member) -> dict:
    """Mini representation of a member used in friends/requests lists."""
    return {
        "id":        member.id,
        "name":      member.name,
        "studentId": member.student_id,
        "lastSeen":  _iso_utc(member.last_seen),
    }


def _profile_payload(member: Member) -> dict:
    """Serialize a member into the shape profile.html expects."""
    from models.enrollment import Enrollment
    from models.friend_request import FriendRequest

    enrollments = Enrollment.query.filter_by(member_id=member.id).order_by(
        Enrollment.enrolled_at.asc()
    ).all()
    enrollment_payload = [
        {
            "course":     e.course,
            "label":      COURSE_LABELS.get(e.course, e.course.title()),
            "enrolledAt": _iso_utc(e.enrolled_at),
        }
        for e in enrollments
    ]

    # Friends — derived from accepted FriendRequest rows.
    friend_ids = _accepted_friend_ids(member.id)
    friends_payload = []
    if friend_ids:
        friends = (
            Member.query.filter(Member.id.in_(friend_ids))
            .order_by(Member.name.asc())
            .all()
        )
        friends_payload = [_friend_brief(f) for f in friends]

    # Outgoing + incoming requests. We surface every status (pending,
    # accepted, rejected) so the requester can see how their request was
    # handled. The recipient only ever sees pending requests — once they
    # accept/reject, the row stops being "actionable" for them.
    outgoing_rows = FriendRequest.query.filter_by(from_id=member.id).order_by(
        FriendRequest.created_at.desc()
    ).all()
    incoming_rows = FriendRequest.query.filter_by(
        to_id=member.id, status="pending",
    ).order_by(FriendRequest.created_at.desc()).all()

    other_ids = {r.to_id for r in outgoing_rows} | {r.from_id for r in incoming_rows}
    others = {
        m.id: m for m in Member.query.filter(Member.id.in_(other_ids)).all()
    } if other_ids else {}

    def _serialize_outgoing(req):
        other = others.get(req.to_id)
        return {
            "id":        req.id,
            "status":    req.status,
            "createdAt": _iso_utc(req.created_at),
            "member":    _friend_brief(other) if other else {"id": req.to_id, "name": "(unknown)"},
        }

    def _serialize_incoming(req):
        other = others.get(req.from_id)
        return {
            "id":        req.id,
            "status":    req.status,
            "createdAt": _iso_utc(req.created_at),
            "member":    _friend_brief(other) if other else {"id": req.from_id, "name": "(unknown)"},
        }

    return {
        "id":          member.id,
        "name":        member.name,
        "email":       member.email,
        "studentId":   member.student_id,
        "status":      member.status,
        "year":        member.year or "",
        "major":       member.major or "",
        "isAdmin":     member.is_admin,
        "createdAt":   _iso_utc(member.created_at),
        "lastSeen":    _iso_utc(member.last_seen),
        "enrollments": enrollment_payload,
        "friends":     friends_payload,
        "friendRequests": {
            "incoming": [_serialize_incoming(r) for r in incoming_rows],
            "outgoing": [_serialize_outgoing(r) for r in outgoing_rows],
        },
    }


@auth_bp.route("/login", methods=["POST"])
def login():
    """Member login → returns JWT."""
    from routes._audit import record as audit_record

    data = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        audit_record("login_failure", email=email or None, status_code=400)
        return jsonify({"error": "Email and password are required"}), 400

    member = Member.query.filter_by(email=email).first()
    if not member or not member.check_password(password):
        audit_record(
            "login_failure",
            email=email,
            member_id=member.id if member else None,
            status_code=401,
        )
        return jsonify({"error": "Invalid email or password"}), 401

    # Block login until the member has chosen a password through the
    # setup-link flow. Defence-in-depth: even if the random placeholder
    # bcrypt was somehow guessed, the request still gets a 403.
    if not member.password_set:
        audit_record(
            "login_failure",
            email=email, member_id=member.id, status_code=403,
        )
        return jsonify({
            "error": "Your account is awaiting password setup. "
                     "Use the link sent to your email to set your password.",
            "passwordSet": False,
        }), 403

    token = create_access_token(
        identity=str(member.id),
        additional_claims={"is_admin": False, "name": member.name, "email": member.email}
    )
    audit_record("login_success", member_id=member.id, email=member.email, status_code=200)
    return jsonify({"token": token, "user": member.to_me_dict()}), 200


# =========================================================================
# Password setup (post-application-approval one-time link).
# -------------------------------------------------------------------------
# Flow:
#   1. Admin approves application -> server emails member a link with a
#      one-time token: ``/set-password.html?token=<...>``.
#   2. Front-end calls GET /api/auth/setup-password/validate?token=...
#      to confirm the link is still good and fetch the member's name to
#      show on the page.
#   3. User submits the form -> POST /api/auth/setup-password with
#      {token, password}. Server stores the new hash and marks the
#      token used. Future log-ins use the normal /api/auth/login route.
# =========================================================================

_MIN_PASSWORD_LEN = 8


@auth_bp.route("/setup-password/validate", methods=["GET"])
def validate_setup_token():
    """Public: confirm a setup link is valid and return the member's
    display name + email so the page can greet them. Returns 400 on bad,
    expired or already-used tokens."""
    from models.password_reset_token import PasswordResetToken

    raw = (request.args.get("token") or "").strip()
    row = PasswordResetToken.lookup(raw, purpose="setup")
    if not row:
        return jsonify({"error": "This link is invalid or has expired."}), 400
    member = Member.query.get(row.member_id)
    if not member:
        return jsonify({"error": "This link is invalid or has expired."}), 400
    return jsonify({
        "valid":      True,
        "name":       member.name,
        "email":      member.email,
        "expiresAt":  _iso_utc(row.expires_at),
    }), 200


@auth_bp.route("/setup-password", methods=["POST"])
def setup_password():
    """Public: consume a setup token and store the member's chosen
    password. After this call the user can log in via /api/auth/login.
    """
    from models.password_reset_token import PasswordResetToken

    data = request.get_json(silent=True) or {}
    raw_token = (data.get("token") or "").strip()
    password  = data.get("password") or ""
    confirm   = data.get("confirm")  or password   # confirm optional from API

    if len(password) < _MIN_PASSWORD_LEN:
        return jsonify({
            "error": f"Password must be at least {_MIN_PASSWORD_LEN} characters.",
        }), 400
    if password != confirm:
        return jsonify({"error": "Passwords do not match."}), 400

    row = PasswordResetToken.lookup(raw_token, purpose="setup")
    if not row:
        return jsonify({"error": "This link is invalid or has expired."}), 400

    member = Member.query.get(row.member_id)
    if not member:
        return jsonify({"error": "This link is invalid or has expired."}), 400

    member.set_password(password)
    member.password_set = True
    row.mark_used()
    db.session.commit()
    return jsonify({
        "message": "Password set. You can now log in.",
        "email":   member.email,
    }), 200


@auth_bp.route("/admin-login", methods=["POST"])
def admin_login():
    """Admin login using the hashed password stored in .env."""
    from routes._audit import record as audit_record

    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""

    admin_hash = current_app.config.get("ADMIN_PASSWORD_HASH", "")
    if not admin_hash:
        audit_record("admin_login_failure", status_code=503)
        return jsonify({"error": "Admin password not configured on server"}), 503

    if not bcrypt.check_password_hash(admin_hash, password):
        audit_record("admin_login_failure", status_code=401)
        return jsonify({"error": "Incorrect admin password"}), 401

    token = create_access_token(
        identity="admin",
        additional_claims={"is_admin": True}
    )
    audit_record("admin_login_success", status_code=200)
    return jsonify({"token": token}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Return the currently authenticated member's profile."""
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"isAdmin": True}), 200

    member_id = int(get_jwt_identity())
    member = Member.query.get(member_id)
    if not member:
        return jsonify({"error": "Member not found"}), 404

    return jsonify(member.to_me_dict()), 200


@auth_bp.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    """Full profile payload for the logged-in member.

    Returns the immutable identity fields (name, email, ID) alongside the
    editable fields (year, major), the list of courses they're enrolled
    in, and their friends list (resolved from member IDs to {id, name}).
    """
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a member profile"}), 403

    member_id = int(get_jwt_identity())
    member = Member.query.get(member_id)
    if not member:
        return jsonify({"error": "Member not found"}), 404

    return jsonify(_profile_payload(member)), 200


@auth_bp.route("/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    """Update the *editable* profile fields.

    Only ``year`` and ``major`` are accepted — ``name``, ``email`` and
    ``id`` are immutable and silently ignored. Returns the fresh profile
    payload so the front-end can re-render without a second round-trip.
    """
    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a member profile"}), 403

    member_id = int(get_jwt_identity())
    member = Member.query.get(member_id)
    if not member:
        return jsonify({"error": "Member not found"}), 404

    data = request.get_json(silent=True) or {}

    if "year" in data:
        year = (data.get("year") or "").strip()
        if year and year not in _VALID_YEARS:
            return jsonify({
                "error": "Invalid year",
                "allowed": sorted(v for v in _VALID_YEARS if v),
            }), 400
        member.year = year[:50] or None

    if "major" in data:
        major = (data.get("major") or "").strip()
        if len(major) > 100:
            return jsonify({"error": "Major must be at most 100 characters"}), 400
        member.major = major or None

    db.session.commit()
    return jsonify({
        "message": "Profile updated",
        "profile": _profile_payload(member),
    }), 200


# =========================================================================
# Friend requests + friendship
# -------------------------------------------------------------------------
# Flow:
#   1. POST   /api/auth/friends/request                     — send request
#   2. GET    /api/auth/friends/requests                    — list incoming + outgoing
#   3. POST   /api/auth/friends/requests/<id>/accept        — recipient accepts
#   4. POST   /api/auth/friends/requests/<id>/reject        — recipient rejects
#   5. DELETE /api/auth/friends/<friend_id>                 — unfriend
#
# Source of truth is the ``friend_requests`` table; an accepted row =
# mutual friendship. Both members appear in each other's friends list
# automatically because the lookup query inspects both ``from_id`` and
# ``to_id``.
# =========================================================================

def _coerce_member_id(raw):
    """Parse an inbound member-id field from JSON, accepting either
    integers or numeric strings. Returns int or None."""
    if raw is None:
        return None
    if isinstance(raw, bool):  # bool is a subclass of int — explicitly reject
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _existing_request(a_id: int, b_id: int):
    """Return the FriendRequest between A and B in either direction, or None."""
    from models.friend_request import FriendRequest

    return FriendRequest.query.filter(
        ((FriendRequest.from_id == a_id) & (FriendRequest.to_id == b_id))
        | ((FriendRequest.from_id == b_id) & (FriendRequest.to_id == a_id))
    ).first()


@auth_bp.route("/friends/request", methods=["POST"])
@jwt_required()
def send_friend_request():
    """Create a pending friend request from the caller to ``memberId``.

    Body: ``{ memberId: <int> }``.

    Behaviour
    ---------
    * 201 — fresh request created.
    * 200 — already friends, or a pending request already exists either
      direction (idempotent).
    * 200 — caller previously rejected an incoming request from this
      member; we re-open it as pending so the conversation can resume.
    * 400 / 404 — self/admin/missing target.
    """
    from models.friend_request import FriendRequest

    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins cannot send friend requests"}), 403

    me_id = int(get_jwt_identity())
    me = Member.query.get(me_id)
    if not me:
        return jsonify({"error": "Member not found"}), 404

    data = request.get_json(silent=True) or {}
    target_id = _coerce_member_id(data.get("memberId"))
    if target_id is None:
        return jsonify({"error": "memberId must be a positive integer"}), 400
    if target_id == me_id:
        return jsonify({"error": "You can't send yourself a friend request"}), 400

    target = Member.query.get(target_id)
    if not target or target.is_admin:
        return jsonify({"error": f"No member found with ID #{target_id}"}), 404

    existing = _existing_request(me_id, target_id)
    if existing:
        if existing.status == "accepted":
            return jsonify({
                "message": f"You are already friends with {target.name}",
                "alreadyFriends": True,
                "profile": _profile_payload(me),
            }), 200
        if existing.status == "pending":
            who = "you" if existing.from_id == me_id else target.name
            return jsonify({
                "message": f"A pending request between you and {target.name} already exists ({who} sent it).",
                "alreadyPending": True,
                "profile": _profile_payload(me),
            }), 200
        # Rejected previously — re-open it. Always rewrite the direction
        # so the new request is from the *current* caller.
        existing.from_id = me_id
        existing.to_id   = target_id
        existing.status  = "pending"
        existing.created_at = datetime.utcnow()
        existing.responded_at = None
        db.session.commit()
        return jsonify({
            "message": f"Friend request re-sent to {target.name}",
            "reopened": True,
            "profile": _profile_payload(me),
        }), 200

    fr = FriendRequest(from_id=me_id, to_id=target_id, status="pending")
    db.session.add(fr)
    db.session.commit()
    return jsonify({
        "message": f"Friend request sent to {target.name}",
        "profile": _profile_payload(me),
    }), 201


@auth_bp.route("/friends/requests", methods=["GET"])
@jwt_required()
def list_friend_requests():
    """Return ``{incoming, outgoing}`` for the caller. ``outgoing`` includes
    every status (so the requester can see accepted/rejected resolutions);
    ``incoming`` only lists pending requests — once you've responded the
    row is no longer relevant for you."""
    from models.friend_request import FriendRequest

    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have friend requests"}), 403

    me_id = int(get_jwt_identity())

    outgoing_rows = FriendRequest.query.filter_by(from_id=me_id).order_by(
        FriendRequest.created_at.desc()
    ).all()
    incoming_rows = FriendRequest.query.filter_by(
        to_id=me_id, status="pending",
    ).order_by(FriendRequest.created_at.desc()).all()

    other_ids = {r.to_id for r in outgoing_rows} | {r.from_id for r in incoming_rows}
    others = {
        m.id: m for m in Member.query.filter(Member.id.in_(other_ids)).all()
    } if other_ids else {}

    def _serialize(req, other_id):
        other = others.get(other_id)
        return {
            "id":        req.id,
            "status":    req.status,
            "createdAt": req.created_at.isoformat() if req.created_at else None,
            "member":    _friend_brief(other) if other else {"id": other_id, "name": "(unknown)"},
        }

    return jsonify({
        "outgoing": [_serialize(r, r.to_id)   for r in outgoing_rows],
        "incoming": [_serialize(r, r.from_id) for r in incoming_rows],
    }), 200


def _resolve_request(req_id: int, accept: bool):
    """Shared accept/reject body. Returns (response, status_code)."""
    from models.friend_request import FriendRequest

    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins cannot respond to friend requests"}), 403

    me_id = int(get_jwt_identity())
    me = Member.query.get(me_id)
    if not me:
        return jsonify({"error": "Member not found"}), 404

    fr = FriendRequest.query.get(req_id)
    if not fr:
        return jsonify({"error": "Friend request not found"}), 404
    if fr.to_id != me_id:
        return jsonify({"error": "You can only respond to your own incoming requests"}), 403
    if fr.status != "pending":
        return jsonify({
            "error": f"This request was already {fr.status}",
        }), 409

    fr.status = "accepted" if accept else "rejected"
    fr.responded_at = datetime.utcnow()
    db.session.commit()
    return jsonify({
        "message": f"Request {fr.status}",
        "request": fr.to_dict(),
        "profile": _profile_payload(me),
    }), 200


@auth_bp.route("/friends/requests/<int:req_id>/accept", methods=["POST"])
@jwt_required()
def accept_friend_request(req_id):
    return _resolve_request(req_id, accept=True)


@auth_bp.route("/friends/requests/<int:req_id>/reject", methods=["POST"])
@jwt_required()
def reject_friend_request(req_id):
    return _resolve_request(req_id, accept=False)


@auth_bp.route("/friends/feed", methods=["GET"])
@jwt_required()
def friends_feed():
    """Return a recent-activity feed from the caller's accepted friends
    plus a head-to-head XP comparison panel.

    Response shape:
    ::

        {
          "me":          {"id", "name", "totalXP"},
          "activities":  [
            {friendId, friendName, friendLastSeen,
             course, label, tasksCompleted, taskTotal,
             earnedXP, labCompleted, lastUpdated},
            … (top 15 sorted by lastUpdated desc)
          ],
          "comparisons": [
            {friend, myXP, theirXP, diff, status},
            … (sorted by theirXP desc — strongest friend first)
          ]
        }

    ``status`` is one of ``"ahead"``/``"behind"``/``"tied"`` from the
    caller's perspective. ``diff = theirXP - myXP`` (positive => friend
    is ahead).
    """
    from models.progress import Progress

    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a friends feed"}), 403

    me_id = int(get_jwt_identity())
    me = Member.query.get(me_id)
    if not me:
        return jsonify({"error": "Member not found"}), 404

    me_xp = me.to_public_dict().get("points", 0)
    me_block = {"id": me.id, "name": me.name, "totalXP": me_xp}

    friend_ids = _accepted_friend_ids(me_id)
    if not friend_ids:
        return jsonify({
            "me":          me_block,
            "activities":  [],
            "comparisons": [],
        }), 200

    friends = Member.query.filter(Member.id.in_(friend_ids)).all()
    friends_by_id = {f.id: f for f in friends}

    # ----- Activities feed --------------------------------------------
    progress_rows = (
        Progress.query
        .filter(Progress.member_id.in_(friend_ids))
        .order_by(Progress.last_updated.desc())
        .limit(50)
        .all()
    )
    activities = []
    for p in progress_rows:
        tasks = p.completed_tasks or []
        if not tasks and not p.lab_completed:
            continue
        friend = friends_by_id.get(p.member_id)
        if not friend:
            continue
        activities.append({
            "friendId":       friend.id,
            "friendName":     friend.name,
            "friendLastSeen": _iso_utc(friend.last_seen),
            "course":         p.course,
            "label":          COURSE_LABELS.get(p.course, p.course.title()),
            "tasksCompleted": len(tasks),
            "taskTotal":      _COURSE_TASK_TOTALS.get(p.course),
            "earnedXP":       p.total_xp or 0,
            "labCompleted":   bool(p.lab_completed),
            "lastUpdated":    _iso_utc(p.last_updated),
        })
        if len(activities) >= 15:
            break

    # ----- XP comparison ----------------------------------------------
    comparisons = []
    for friend in friends:
        their_xp = friend.to_public_dict().get("points", 0)
        diff = their_xp - me_xp
        if diff > 0:    status = "behind"   # friend is ahead, you're behind
        elif diff < 0:  status = "ahead"
        else:           status = "tied"
        comparisons.append({
            "friend":  _friend_brief(friend),
            "myXP":    me_xp,
            "theirXP": their_xp,
            "diff":    diff,
            "status":  status,
        })
    comparisons.sort(key=lambda c: c["theirXP"], reverse=True)

    return jsonify({
        "me":          me_block,
        "activities":  activities,
        "comparisons": comparisons,
    }), 200


@auth_bp.route("/friends/<int:friend_id>", methods=["DELETE"])
@jwt_required()
def unfriend(friend_id):
    """Remove an *accepted* friend. Deletes the underlying request row
    so the friendship is fully gone for both sides."""
    from models.friend_request import FriendRequest

    claims = get_jwt()
    if claims.get("is_admin"):
        return jsonify({"error": "Admins do not have a friends list"}), 403

    me_id = int(get_jwt_identity())
    me = Member.query.get(me_id)
    if not me:
        return jsonify({"error": "Member not found"}), 404

    fr = FriendRequest.query.filter(
        FriendRequest.status == "accepted",
        ((FriendRequest.from_id == me_id) & (FriendRequest.to_id == friend_id))
        | ((FriendRequest.from_id == friend_id) & (FriendRequest.to_id == me_id)),
    ).first()
    if not fr:
        return jsonify({"error": "That member isn't in your friends list"}), 404

    db.session.delete(fr)
    db.session.commit()
    return jsonify({
        "message": "Friend removed",
        "profile": _profile_payload(me),
    }), 200
