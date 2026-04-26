"""
Notifications endpoint.

Backs the header bell + dropdown introduced alongside the per-course task
toasts. One consolidated endpoint keeps the polling cheap and avoids
hammering the friend / event / news routes separately every minute.

Returns three buckets:

* ``friendRequests`` — pending incoming friend requests for the caller
  (latest first), including the requester's name so the dropdown can
  render the row without a follow-up call.
* ``latestEvent``    — next upcoming event (start time >= now); falls
  back to the most recent past event if none are upcoming, or ``None``
  when no events exist at all.
* ``news``           — the three most recent items from
  ``backend/news_items.NEWS``, the new single-source-of-truth for the
  news.html cards.

Member JWT only. Admins get 403 — there's nothing here for them and the
audit log already covers admin activity.
"""
from __future__ import annotations

from datetime import datetime

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from extensions import db
from models.event import Event
from models.event_registration import EventRegistration
from models.friend_request import FriendRequest
from models.member import Member
from news_items import latest_news


notifications_bp = Blueprint("notifications", __name__)


def _current_member_id_or_403():
    """Return the caller's member id, or a Flask 403 response.

    Called by the only route in this blueprint, which is decorated with
    ``@jwt_required()`` so we know a JWT is present.
    """
    claims = get_jwt() or {}
    if claims.get("is_admin"):
        return None, (jsonify({"error": "Admins do not receive notifications here"}), 403)
    raw = get_jwt_identity()
    try:
        member_id = int(raw)
    except (TypeError, ValueError):
        return None, (jsonify({"error": "Authentication required"}), 401)
    if member_id <= 0:
        return None, (jsonify({"error": "Authentication required"}), 401)
    return member_id, None


def _serialise_friend_request(fr: FriendRequest, requester: Member) -> dict:
    return {
        "id":        fr.id,
        "fromId":    fr.from_id,
        "fromName":  requester.name if requester else f"Member #{fr.from_id}",
        "fromEmail": requester.email if requester else None,
        "createdAt": fr.created_at.isoformat() + "Z" if fr.created_at else None,
    }


def _latest_event_payload() -> dict | None:
    """Pick the next upcoming event, or fall back to the most recent past
    event when there's nothing scheduled. Returns ``None`` only when the
    events table is completely empty.
    """
    now = datetime.utcnow()
    upcoming = (
        Event.query
        .filter(Event.starts_at >= now)
        .order_by(Event.starts_at.asc())
        .first()
    )
    chosen = upcoming or (
        Event.query.order_by(Event.starts_at.desc()).first()
    )
    if not chosen:
        return None
    payload = chosen.to_public_dict()
    # createdAt drives the unread-badge logic on the client.
    payload["createdAt"] = (
        chosen.created_at.isoformat() + "Z" if chosen.created_at else None
    )
    payload["registrationsCount"] = (
        EventRegistration.query.filter_by(event_id=chosen.id).count()
    )
    payload["isUpcoming"] = upcoming is not None
    return payload


@notifications_bp.route("/summary", methods=["GET"])
@jwt_required()
def notifications_summary():
    member_id, err = _current_member_id_or_403()
    if err is not None:
        return err

    # --- Pending incoming friend requests (latest 10) --------------------
    pending_q = (
        db.session.query(FriendRequest, Member)
        .join(Member, Member.id == FriendRequest.from_id)
        .filter(
            FriendRequest.to_id == member_id,
            FriendRequest.status == "pending",
        )
        .order_by(FriendRequest.created_at.desc())
        .limit(10)
    )
    friend_requests = [
        _serialise_friend_request(fr, requester)
        for fr, requester in pending_q.all()
    ]

    # --- Latest event ----------------------------------------------------
    latest_event = _latest_event_payload()

    # --- News ------------------------------------------------------------
    news = latest_news(limit=3)

    return jsonify({
        "friendRequests": friend_requests,
        "latestEvent":    latest_event,
        "news":           news,
        "generatedAt":    datetime.utcnow().isoformat() + "Z",
    }), 200
