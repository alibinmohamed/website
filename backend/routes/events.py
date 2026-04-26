"""Public-facing events endpoints.

Admin-only event management lives in ``routes/admin.py`` (under
``/api/admin/events``). This blueprint is registered at ``/api/events``
and exposes the read-only listings plus per-member registration.
"""

from datetime import datetime, timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import (
    jwt_required, get_jwt_identity, get_jwt, verify_jwt_in_request,
)

from extensions import db
from models.event import Event
from models.event_registration import EventRegistration


events_bp = Blueprint("events", __name__)


def _current_member_id():
    """Best-effort: return the caller's member id, or ``None`` for guests
    / admins. Uses ``optional=True`` so unauthenticated calls don't raise.
    """
    try:
        verify_jwt_in_request(optional=True)
    except Exception:
        return None
    try:
        claims = get_jwt() or {}
    except Exception:
        return None
    if claims.get("is_admin"):
        return None
    raw = get_jwt_identity()
    if not raw:
        return None
    try:
        n = int(raw)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _augment(event_dict, event_id, member_id):
    """Add ``registrationsCount`` and ``registered`` to a public dict."""
    event_dict["registrationsCount"] = (
        EventRegistration.query.filter_by(event_id=event_id).count()
    )
    if member_id is not None:
        event_dict["registered"] = bool(
            EventRegistration.query
            .filter_by(event_id=event_id, member_id=member_id)
            .first()
        )
    else:
        event_dict["registered"] = False
    return event_dict


@events_bp.route("", methods=["GET"])
def list_events():
    """Return upcoming + recently-finished events.

    The admin portal sees *every* event via ``/api/admin/events``; this
    endpoint trims the noise for the public events page by keeping only
    events that start in the future or finished within the last 30 days.
    Augments each row with ``registrationsCount`` and (for authenticated
    callers) a ``registered`` boolean.
    """
    cutoff = datetime.utcnow() - timedelta(days=30)
    rows = (
        Event.query
        .filter(Event.starts_at >= cutoff)
        .order_by(Event.starts_at.asc())
        .all()
    )
    member_id = _current_member_id()
    return jsonify([
        _augment(e.to_public_dict(), e.id, member_id) for e in rows
    ]), 200


@events_bp.route("/<int:event_id>", methods=["GET"])
def get_event(event_id):
    ev = Event.query.get_or_404(event_id)
    member_id = _current_member_id()
    return jsonify(_augment(ev.to_public_dict(), ev.id, member_id)), 200


@events_bp.route("/<int:event_id>/register", methods=["POST"])
@jwt_required()
def register_for_event(event_id):
    """Idempotent: registers the caller for ``event_id``."""
    claims = get_jwt() or {}
    if claims.get("is_admin"):
        return jsonify({"error": "Admins cannot register for events"}), 403

    member_id = _current_member_id()
    if member_id is None:
        return jsonify({"error": "Authentication required"}), 401

    ev = Event.query.get_or_404(event_id)

    existing = EventRegistration.query.filter_by(
        event_id=ev.id, member_id=member_id,
    ).first()
    if not existing:
        reg = EventRegistration(
            event_id=ev.id, member_id=member_id, status="registered",
        )
        db.session.add(reg)
        db.session.commit()

    return jsonify(_augment(ev.to_public_dict(), ev.id, member_id)), 200


@events_bp.route("/<int:event_id>/register", methods=["DELETE"])
@jwt_required()
def cancel_registration(event_id):
    """Cancel the caller's registration for ``event_id``. Idempotent."""
    claims = get_jwt() or {}
    if claims.get("is_admin"):
        return jsonify({"error": "Admins cannot cancel registrations here"}), 403

    member_id = _current_member_id()
    if member_id is None:
        return jsonify({"error": "Authentication required"}), 401

    ev = Event.query.get_or_404(event_id)

    reg = EventRegistration.query.filter_by(
        event_id=ev.id, member_id=member_id,
    ).first()
    if reg:
        db.session.delete(reg)
        db.session.commit()

    return jsonify(_augment(ev.to_public_dict(), ev.id, member_id)), 200
