"""Audit-log helpers.

Anything in this module is best-effort: a failure here must NEVER break
a request. The admin "Activity log" tab uses these rows; if a row goes
missing the user-visible behaviour is identical.
"""

from __future__ import annotations

import uuid
from typing import Optional

from flask import request, g
from flask import current_app

from extensions import db


_SESSION_COOKIE = "cyber_sid"
# Skip these endpoints in the api_request firehose. Login routes get
# their own dedicated rows from auth.py so they aren't lost in the noise.
_SKIP_PATHS = {
    "/api/auth/login",
    "/api/auth/admin-login",
}


def _client_ip() -> Optional[str]:
    """Return the best guess at the originating client IP.

    Honours ``X-Forwarded-For`` (first hop) when present so reverse-proxy
    deployments see real addresses, otherwise falls back to
    ``remote_addr``.
    """
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()[:64] or None
    return (request.remote_addr or "")[:64] or None


def _user_agent() -> Optional[str]:
    ua = request.headers.get("User-Agent") or ""
    return ua[:400] or None


def session_id() -> str:
    """Read or mint the per-browser session cookie value.

    Stored on ``flask.g`` so a single request always sees the same value
    even if the cookie was just minted (and is therefore not yet on
    ``request.cookies``). The actual ``Set-Cookie`` is emitted by the
    ``after_request`` hook in ``app.py``.
    """
    if hasattr(g, "_audit_session_id"):
        return g._audit_session_id
    sid = request.cookies.get(_SESSION_COOKIE) or uuid.uuid4().hex
    g._audit_session_id = sid
    return sid


def record(action: str,
           *,
           member_id: Optional[int] = None,
           email: Optional[str] = None,
           status_code: Optional[int] = None) -> None:
    """Insert an ``audit_log`` row. Swallows all errors."""
    from models.audit_log import AuditLog
    try:
        row = AuditLog(
            member_id=member_id,
            email_attempted=(email or "")[:255] or None,
            action=action[:40],
            path=(request.path or "")[:255],
            method=(request.method or "")[:10],
            status_code=status_code,
            ip=_client_ip(),
            user_agent=_user_agent(),
            session_id=session_id(),
        )
        db.session.add(row)
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass


def should_skip_request_logging() -> bool:
    """Return True for paths the firehose middleware should ignore."""
    if not (request.path or "").startswith("/api/"):
        return True
    if request.method == "OPTIONS":
        return True
    if request.path in _SKIP_PATHS:
        return True
    # Terminal websockets are upgraded outside the normal request cycle
    # already, but be defensive.
    if "/terminal" in (request.path or ""):
        return True
    return False
