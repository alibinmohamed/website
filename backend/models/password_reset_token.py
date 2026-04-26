"""One-time tokens used for password setup (after admin approval) and,
later, password reset.

Storage stores the SHA-256 hex digest of the token rather than the raw
value, so a database leak doesn't expose live links. The raw token is
returned to the caller exactly once \u2014 when it is created \u2014 and
emailed straight to the applicant.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple

from extensions import db


# How long an emailed setup link stays valid before the user has to ask
# the admin for a fresh one.
DEFAULT_TTL = timedelta(hours=24)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"

    id          = db.Column(db.Integer, primary_key=True)
    member_id   = db.Column(db.Integer,
                            db.ForeignKey("members.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    token_hash  = db.Column(db.String(64),  nullable=False, unique=True, index=True)
    purpose     = db.Column(db.String(20),  nullable=False, default="setup")
    created_at  = db.Column(db.DateTime,    default=datetime.utcnow, nullable=False)
    expires_at  = db.Column(db.DateTime,    nullable=False)
    used_at     = db.Column(db.DateTime,    nullable=True)

    # ------------------------------------------------------------------ helpers

    @classmethod
    def issue(cls,
              member_id: int,
              purpose: str = "setup",
              ttl: Optional[timedelta] = None) -> Tuple["PasswordResetToken", str]:
        """Create + persist a fresh token. Returns ``(row, raw_token)``.

        Any previous active tokens for the same ``(member_id, purpose)``
        are invalidated by setting ``used_at`` so we never have two valid
        links floating around at once.
        """
        cls.query.filter(
            cls.member_id == member_id,
            cls.purpose == purpose,
            cls.used_at.is_(None),
            cls.expires_at > datetime.utcnow(),
        ).update({"used_at": datetime.utcnow()}, synchronize_session=False)

        raw = secrets.token_urlsafe(32)
        row = cls(
            member_id=member_id,
            token_hash=hash_token(raw),
            purpose=purpose,
            expires_at=datetime.utcnow() + (ttl or DEFAULT_TTL),
        )
        db.session.add(row)
        return row, raw

    @classmethod
    def lookup(cls, raw: str, purpose: str = "setup") -> Optional["PasswordResetToken"]:
        """Return an active (not used, not expired) token row or ``None``."""
        if not raw:
            return None
        row = cls.query.filter_by(
            token_hash=hash_token(raw), purpose=purpose,
        ).first()
        if not row:
            return None
        if row.used_at is not None:
            return None
        if row.expires_at <= datetime.utcnow():
            return None
        return row

    def mark_used(self) -> None:
        self.used_at = datetime.utcnow()
