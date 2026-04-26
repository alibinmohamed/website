"""Admin-only REST endpoints powering admin.html.

Every route in this module requires a JWT minted via the admin-login
endpoint (``additional_claims={"is_admin": True}``). ``_admin_required``
is a thin wrapper that returns ``(claims, None)`` on success or
``(None, error_response)`` so handlers can early-return on auth failure.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Optional

from flask import Blueprint, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt
from werkzeug.utils import secure_filename
from sqlalchemy import func

from extensions import db
from models.member import Member
from models.application import Application
from models.audit_log import AuditLog
from models.event import Event
from models.event_registration import EventRegistration


admin_bp = Blueprint("admin", __name__)


# Largest image we'll accept on /api/admin/events/<id>/image.
_MAX_EVENT_IMAGE_BYTES = 4 * 1024 * 1024
_ALLOWED_IMAGE_EXTS = {"png", "jpg", "jpeg", "webp"}


def _admin_required():
    try:
        verify_jwt_in_request()
        claims = get_jwt()
        if not claims.get("is_admin"):
            return None, (jsonify({"error": "Admin access required"}), 403)
        return claims, None
    except Exception:
        return None, (jsonify({"error": "Missing or invalid token"}), 401)


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 / ``YYYY-MM-DDTHH:MM`` string into a naive UTC
    datetime. Returns ``None`` for empty/invalid input.

    The HTML5 ``datetime-local`` input emits a value without timezone,
    e.g. ``2026-05-01T18:30``. We treat such values as UTC for storage
    consistency with the rest of the app (``datetime.utcnow``).
    """
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1]
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


# ----------------------------------------------------------------- Stats / overview

@admin_bp.route("/stats", methods=["GET"])
def stats():
    """Legacy 3-counter overview kept for backward compatibility with the
    older admin.html. Prefer ``/api/admin/overview``."""
    claims, err = _admin_required()
    if err:
        return err

    pending_count  = Application.query.filter_by(status="pending").count()
    approved_count = Member.query.count()
    total_apps     = Application.query.count()

    return jsonify({
        "pendingCount":  pending_count,
        "approvedCount": approved_count,
        "totalCount":    total_apps + approved_count,
    }), 200


@admin_bp.route("/overview", methods=["GET"])
def overview():
    """Counters + recent logins + app-status breakdown."""
    claims, err = _admin_required()
    if err:
        return err

    pending_count  = Application.query.filter_by(status="pending").count()
    approved_count = Member.query.count()
    total_apps     = Application.query.count()

    apps_by_status = dict(
        db.session.query(Application.status, func.count(Application.id))
        .group_by(Application.status)
        .all()
    )

    last_24h = datetime.utcnow() - timedelta(hours=24)
    failed_logins_24h = AuditLog.query.filter(
        AuditLog.action.in_(("login_failure", "admin_login_failure")),
        AuditLog.created_at >= last_24h,
    ).count()

    recent_login_rows = (
        AuditLog.query
        .filter(AuditLog.action.in_((
            "login_success", "login_failure",
            "admin_login_success", "admin_login_failure",
        )))
        .order_by(AuditLog.created_at.desc())
        .limit(10)
        .all()
    )
    member_ids = {r.member_id for r in recent_login_rows if r.member_id}
    members_by_id = {
        m.id: m for m in Member.query.filter(Member.id.in_(member_ids)).all()
    } if member_ids else {}
    recent_logins = [
        r.to_dict(member_name=members_by_id.get(r.member_id).name
                  if members_by_id.get(r.member_id) else None)
        for r in recent_login_rows
    ]

    events_total = Event.query.count()

    return jsonify({
        "pendingCount":         pending_count,
        "approvedCount":        approved_count,
        "totalCount":           total_apps + approved_count,
        "applicationsByStatus": apps_by_status,
        "failedLogins24h":      failed_logins_24h,
        "recentLogins":         recent_logins,
        "eventsTotal":          events_total,
    }), 200


# ----------------------------------------------------------------- Members

@admin_bp.route("/members", methods=["GET"])
def members():
    """Full member dump including phone, last seen, and the IP /
    user-agent derived from the most recent audit-log row."""
    claims, err = _admin_required()
    if err:
        return err

    rows = Member.query.order_by(Member.created_at.asc()).all()

    # Pull the last audit row (any action) per member in one query so we
    # can show their most recent IP / user-agent without a per-row sub-
    # query.
    last_seen_rows = {}
    if rows:
        ids = [m.id for m in rows]
        # Pick the highest id row per member as a proxy for "most recent"
        # (id is monotonically increasing; created_at would also work).
        latest_per_member_q = (
            db.session.query(
                AuditLog.member_id,
                func.max(AuditLog.id).label("max_id"),
            )
            .filter(AuditLog.member_id.in_(ids))
            .group_by(AuditLog.member_id)
            .subquery()
        )
        latest_rows = (
            db.session.query(AuditLog)
            .join(latest_per_member_q, AuditLog.id == latest_per_member_q.c.max_id)
            .all()
        )
        last_seen_rows = {r.member_id: r for r in latest_rows}

    out = []
    for m in rows:
        d = m.to_admin_dict()
        last = last_seen_rows.get(m.id)
        d["lastIp"]        = last.ip if last else None
        d["lastUserAgent"] = last.user_agent if last else None
        out.append(d)

    out.sort(key=lambda d: d.get("points", 0), reverse=True)
    return jsonify(out), 200


# ----------------------------------------------------------------- Applications (admin view)

@admin_bp.route("/applications", methods=["GET"])
def applications():
    """List applications by status (default = all)."""
    claims, err = _admin_required()
    if err:
        return err

    status = (request.args.get("status") or "").strip().lower()
    q = Application.query
    if status and status != "all":
        q = q.filter_by(status=status)
    rows = q.order_by(Application.applied_date.desc()).all()
    return jsonify([a.to_dict() for a in rows]), 200


# ----------------------------------------------------------------- Audit log

_ALLOWED_AUDIT_ACTIONS = {
    "all",
    "login_success", "login_failure",
    "admin_login_success", "admin_login_failure",
    "api_request",
}


@admin_bp.route("/audit-log", methods=["GET"])
def audit_log():
    """Paginated audit-log view.

    Query params:
        ``limit``    integer, default 200, max 1000.
        ``action``   filter on the action column (see ``_ALLOWED_AUDIT_ACTIONS``).
        ``memberId`` filter to a single member.
        ``q``        substring search across email_attempted / ip / path.
    """
    claims, err = _admin_required()
    if err:
        return err

    try:
        limit = int(request.args.get("limit", 200))
    except (TypeError, ValueError):
        limit = 200
    limit = max(1, min(limit, 1000))

    action = (request.args.get("action") or "all").strip().lower()
    if action not in _ALLOWED_AUDIT_ACTIONS:
        action = "all"

    q = AuditLog.query
    if action != "all":
        q = q.filter(AuditLog.action == action)

    member_id_arg = request.args.get("memberId")
    if member_id_arg:
        try:
            q = q.filter(AuditLog.member_id == int(member_id_arg))
        except (TypeError, ValueError):
            pass

    search = (request.args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        q = q.filter(
            (AuditLog.email_attempted.ilike(like))
            | (AuditLog.ip.ilike(like))
            | (AuditLog.path.ilike(like))
        )

    rows = q.order_by(AuditLog.created_at.desc()).limit(limit).all()
    member_ids = {r.member_id for r in rows if r.member_id}
    members_by_id = {
        m.id: m for m in Member.query.filter(Member.id.in_(member_ids)).all()
    } if member_ids else {}
    return jsonify([
        r.to_dict(member_name=members_by_id.get(r.member_id).name
                  if members_by_id.get(r.member_id) else None)
        for r in rows
    ]), 200


# ----------------------------------------------------------------- Events CRUD

def _event_payload_from_json(data: dict):
    """Coerce raw JSON into an ``Event`` field dict. Returns ``(fields, errors)``."""
    errors: dict = {}
    title = (data.get("title") or "").strip()
    if not title:
        errors["title"] = "Title is required."
    elif len(title) > 200:
        errors["title"] = "Title must be at most 200 characters."

    description = (data.get("description") or "").strip()
    location    = (data.get("location") or "").strip()
    if len(location) > 255:
        errors["location"] = "Location must be at most 255 characters."

    starts_at = _parse_dt(data.get("startsAt"))
    if not starts_at:
        errors["startsAt"] = "Start date/time is required (ISO format)."

    ends_at = _parse_dt(data.get("endsAt"))
    if ends_at and starts_at and ends_at < starts_at:
        errors["endsAt"] = "End time must be after the start time."

    if errors:
        return None, errors

    return {
        "title":       title,
        "description": description or None,
        "location":    location or None,
        "starts_at":   starts_at,
        "ends_at":     ends_at,
    }, None


def _registrations_count(event_id: int) -> int:
    return EventRegistration.query.filter_by(event_id=event_id).count()


@admin_bp.route("/events", methods=["GET"])
def list_events_admin():
    claims, err = _admin_required()
    if err:
        return err
    rows = Event.query.order_by(Event.starts_at.desc()).all()
    return jsonify([e.to_admin_dict(_registrations_count(e.id)) for e in rows]), 200


@admin_bp.route("/events", methods=["POST"])
def create_event():
    claims, err = _admin_required()
    if err:
        return err
    fields, ferrs = _event_payload_from_json(request.get_json(silent=True) or {})
    if ferrs:
        return jsonify({"error": "Please fix the highlighted fields.", "fields": ferrs}), 400
    ev = Event(created_by="admin", **fields)
    db.session.add(ev)
    db.session.commit()
    return jsonify(ev.to_admin_dict()), 201


@admin_bp.route("/events/<int:event_id>", methods=["PUT"])
def update_event(event_id):
    claims, err = _admin_required()
    if err:
        return err
    ev = Event.query.get_or_404(event_id)
    fields, ferrs = _event_payload_from_json(request.get_json(silent=True) or {})
    if ferrs:
        return jsonify({"error": "Please fix the highlighted fields.", "fields": ferrs}), 400
    for k, v in fields.items():
        setattr(ev, k, v)
    db.session.commit()
    return jsonify(ev.to_admin_dict(_registrations_count(ev.id))), 200


@admin_bp.route("/events/<int:event_id>", methods=["DELETE"])
def delete_event(event_id):
    claims, err = _admin_required()
    if err:
        return err
    ev = Event.query.get_or_404(event_id)
    # Best-effort image cleanup so we don't leave orphan files behind.
    if ev.image_path:
        try:
            full = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", ev.image_path)
            )
            if os.path.isfile(full):
                os.remove(full)
        except OSError:
            pass
    db.session.delete(ev)
    db.session.commit()
    return jsonify({"message": "Event deleted"}), 200


@admin_bp.route("/events/<int:event_id>/image", methods=["POST"])
def upload_event_image(event_id):
    claims, err = _admin_required()
    if err:
        return err
    ev = Event.query.get_or_404(event_id)

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded (field 'file' missing)."}), 400
    f = request.files["file"]
    filename = secure_filename(f.filename or "")
    if "." not in filename:
        return jsonify({"error": "File needs a recognisable extension."}), 400
    ext = filename.rsplit(".", 1)[1].lower()
    if ext not in _ALLOWED_IMAGE_EXTS:
        return jsonify({
            "error": f"Unsupported image type. Allowed: {sorted(_ALLOWED_IMAGE_EXTS)}",
        }), 400

    # Read into memory once so we can size-check before writing to disk.
    blob = f.read()
    if not blob:
        return jsonify({"error": "Uploaded file is empty."}), 400
    if len(blob) > _MAX_EVENT_IMAGE_BYTES:
        return jsonify({
            "error": f"Image too large (max {_MAX_EVENT_IMAGE_BYTES // (1024 * 1024)} MB).",
        }), 413

    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    target_dir = os.path.join(backend_root, "uploads", "events")
    os.makedirs(target_dir, exist_ok=True)
    out_name = f"{event_id}.{ext}"
    out_path = os.path.join(target_dir, out_name)

    # Remove any previous image with a different extension.
    for stale_ext in _ALLOWED_IMAGE_EXTS:
        if stale_ext == ext:
            continue
        stale = os.path.join(target_dir, f"{event_id}.{stale_ext}")
        if os.path.isfile(stale):
            try:
                os.remove(stale)
            except OSError:
                pass

    with open(out_path, "wb") as fh:
        fh.write(blob)

    ev.image_path = f"uploads/events/{out_name}"
    db.session.commit()
    return jsonify(ev.to_admin_dict(_registrations_count(ev.id))), 200


# ----------------------------------------------------------------- Member password ops

_MIN_PASSWORD_LEN = 8


@admin_bp.route("/members/<int:member_id>/resend-setup", methods=["POST"])
def resend_member_setup(member_id):
    """Issue a fresh password-setup token for ``member_id`` and email
    them the link. Useful when the original email got lost or the link
    expired. Any prior live tokens are invalidated by
    ``PasswordResetToken.issue``.
    """
    from models.password_reset_token import PasswordResetToken
    from routes.applications import _setup_link, _send_setup_password_email

    claims, err = _admin_required()
    if err:
        return err

    m = Member.query.get_or_404(member_id)
    if m.is_admin:
        return jsonify({"error": "Admins don't use the setup-link flow."}), 400

    _, raw_token = PasswordResetToken.issue(member_id=m.id, purpose="setup")
    db.session.commit()
    link = _setup_link(raw_token)
    emailed = _send_setup_password_email(m, link)
    return jsonify({
        "message":   f"New setup link issued for {m.name}.",
        "emailSent": emailed,
        "setupLink": link,
    }), 200


@admin_bp.route("/members/<int:member_id>/set-password", methods=["POST"])
def admin_set_member_password(member_id):
    """Admin override: set a member's password directly. Marks the
    member as ``password_set=True`` so they can log in immediately, and
    invalidates any outstanding setup tokens for that member.
    """
    from models.password_reset_token import PasswordResetToken

    claims, err = _admin_required()
    if err:
        return err

    m = Member.query.get_or_404(member_id)
    if m.is_admin:
        return jsonify({"error": "Cannot rewrite an admin's password here."}), 400

    data = request.get_json(silent=True) or {}
    password = (data.get("password") or "").strip()
    if len(password) < _MIN_PASSWORD_LEN:
        return jsonify({
            "error": f"Password must be at least {_MIN_PASSWORD_LEN} characters.",
        }), 400

    m.set_password(password)
    m.password_set = True
    # Burn any pending setup tokens so the old link can't still be used.
    PasswordResetToken.query.filter(
        PasswordResetToken.member_id == m.id,
        PasswordResetToken.purpose == "setup",
        PasswordResetToken.used_at.is_(None),
    ).update({"used_at": datetime.utcnow()}, synchronize_session=False)
    db.session.commit()
    return jsonify({
        "message":     f"Password updated for {m.name}.",
        "passwordSet": True,
    }), 200


# ----------------------------------------------------------------- Event registrations (admin view)

@admin_bp.route("/events/<int:event_id>/registrations", methods=["GET"])
def list_event_registrations(event_id):
    """Return everyone registered for ``event_id`` with their member info."""
    claims, err = _admin_required()
    if err:
        return err
    Event.query.get_or_404(event_id)

    rows = (
        EventRegistration.query
        .filter_by(event_id=event_id)
        .order_by(EventRegistration.created_at.asc())
        .all()
    )
    member_ids = [r.member_id for r in rows]
    members_by_id = {
        m.id: m for m in Member.query.filter(Member.id.in_(member_ids)).all()
    } if member_ids else {}

    out = []
    for r in rows:
        m = members_by_id.get(r.member_id)
        out.append(r.to_dict(
            member_name  = m.name  if m else None,
            member_email = m.email if m else None,
        ))
    return jsonify(out), 200
