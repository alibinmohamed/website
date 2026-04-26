from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from models.member import Member
from extensions import db

members_bp = Blueprint("members", __name__)


def _iso_utc(dt):
    """ISO-8601 with a ``Z`` suffix so the front-end parses it as UTC.
    See ``routes.auth._iso_utc`` for the rationale."""
    if dt is None:
        return None
    s = dt.isoformat()
    return s if (s.endswith("Z") or "+" in s[10:] or "-" in s[10:]) else s + "Z"


# Course slug → human label, mirrors auth.py / app.js. Kept inline so the
# members blueprint doesn't need to import auth.
_COURSE_LABELS = {
    "ethics":  "Cybersecurity Ethics & Laws",
    "linux":   "Linux Fundamentals",
    "network": "Network Fundamentals",
    "crypto":  "Cryptography",
    "web":     "Web & Application Fundamentals",
    "pentest": "Penetration Testing",
}
_COURSE_TASK_TOTALS = {
    "ethics":  36, "linux": 34, "network": 37,
    "crypto":  36, "web":   36, "pentest": 48,
}


def _admin_required():
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    try:
        verify_jwt_in_request()
        claims = get_jwt()
        if not claims.get("is_admin"):
            return None, (jsonify({"error": "Admin access required"}), 403)
        return claims, None
    except Exception:
        return None, (jsonify({"error": "Missing or invalid token"}), 401)


@members_bp.route("", methods=["GET"])
def get_members():
    """
    Public: leaderboard (name + points + tasks, no emails/passwords).
    Admin token: returns full member details.
    """
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    is_admin = False
    try:
        verify_jwt_in_request(optional=True)
        claims  = get_jwt()
        is_admin = claims.get("is_admin", False)
    except Exception:
        pass

    members = Member.query.order_by(Member.created_at).all()

    if is_admin:
        data = sorted([m.to_admin_dict() for m in members], key=lambda x: x["points"], reverse=True)
    else:
        data = sorted([m.to_public_dict() for m in members], key=lambda x: x["points"], reverse=True)

    return jsonify(data), 200


@members_bp.route("/<int:member_id>/public-profile", methods=["GET"])
@jwt_required()
def public_profile(member_id):
    """Return a friend-visible slice of another member's profile.

    Only the caller themselves OR an accepted friend of ``member_id`` may
    fetch this. Admins are also allowed (read-only support).
    """
    from models.enrollment    import Enrollment
    from models.progress      import Progress
    from routes.auth          import _are_friends, _accepted_friend_ids

    claims = get_jwt() or {}
    is_admin = bool(claims.get("is_admin"))

    if is_admin:
        viewer_id = -1   # admins always pass the friend check below
    else:
        try:
            viewer_id = int(get_jwt_identity())
        except (TypeError, ValueError):
            return jsonify({"error": "Authentication required"}), 401

    target = Member.query.get(member_id)
    if not target or target.is_admin:
        return jsonify({"error": "Member not found"}), 404

    # Access control: self, friend, or admin.
    if not is_admin and viewer_id != target.id and not _are_friends(viewer_id, target.id):
        return jsonify({
            "error": "You can only view profiles of your friends.",
        }), 403

    # Enrollments — list of courses they're signed up for.
    enrollments = Enrollment.query.filter_by(member_id=target.id).order_by(
        Enrollment.enrolled_at.asc()
    ).all()
    enrollment_payload = [
        {
            "course":     e.course,
            "label":      _COURSE_LABELS.get(e.course, e.course.title()),
            "enrolledAt": _iso_utc(e.enrolled_at),
        }
        for e in enrollments
    ]

    # Recent activities — a per-course summary of progress, only courses
    # they've actually started. Sorted by last_updated descending so the
    # newest activity is on top.
    progress_rows = Progress.query.filter_by(member_id=target.id).all()
    activities = []
    for p in progress_rows:
        tasks = p.completed_tasks or []
        if not tasks and not p.lab_completed:
            continue
        activities.append({
            "course":         p.course,
            "label":          _COURSE_LABELS.get(p.course, p.course.title()),
            "tasksCompleted": len(tasks),
            "taskTotal":      _COURSE_TASK_TOTALS.get(p.course),
            "earnedXP":       p.total_xp or 0,
            "labCompleted":   bool(p.lab_completed),
            "lastUpdated":    _iso_utc(p.last_updated),
        })
    activities.sort(
        key=lambda a: a.get("lastUpdated") or "", reverse=True,
    )

    # Friendship metadata so the front-end can show the right CTA.
    if is_admin:
        friendship = "admin"
    elif viewer_id == target.id:
        friendship = "self"
    else:
        friendship = "friend"

    return jsonify({
        "id":              target.id,
        "name":            target.name,
        "major":           target.major or "",
        "year":            target.year or "",
        "lastSeen":        _iso_utc(target.last_seen),
        "enrollments":     enrollment_payload,
        "recentActivities": activities,
        "friendship":      friendship,
    }), 200


@members_bp.route("/<int:member_id>", methods=["DELETE"])
def delete_member(member_id):
    """Admin: permanently delete a member and all their progress."""
    claims, err = _admin_required()
    if err:
        return err

    member = Member.query.get_or_404(member_id)
    db.session.delete(member)
    db.session.commit()
    return jsonify({"message": f"{member.name} has been removed"}), 200
