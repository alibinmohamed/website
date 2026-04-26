from datetime import datetime
from typing import Optional

from extensions import db


# TODO: add a periodic clean-up job that deletes audit_log rows older
# than ~90 days. For now we accept unbounded growth — admins can
# manually truncate the table if needed.
class AuditLog(db.Model):
    """Append-only record of every authenticated API call and every login
    attempt (successful or otherwise).

    Designed for the admin "Activity log" tab. Captures the bare minimum
    needed to investigate suspicious behaviour: who, when, where (IP),
    what (path/method) and from which device (user-agent + a stable
    cookie session id).
    """

    __tablename__ = "audit_log"

    id              = db.Column(db.Integer, primary_key=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow,
                                nullable=False, index=True)
    member_id       = db.Column(db.Integer,
                                db.ForeignKey("members.id", ondelete="SET NULL"),
                                nullable=True, index=True)
    # Stored on failed-login rows where there is no resolvable member.
    email_attempted = db.Column(db.String(255), nullable=True)
    action          = db.Column(db.String(40),  nullable=False, index=True)
    path            = db.Column(db.String(255), nullable=True)
    method          = db.Column(db.String(10),  nullable=True)
    status_code     = db.Column(db.Integer,     nullable=True)
    ip              = db.Column(db.String(64),  nullable=True)
    user_agent      = db.Column(db.String(400), nullable=True)
    # Stable per-browser cookie value — set by the audit helper if
    # missing. Lets the admin spot a single device hopping between
    # accounts.
    session_id      = db.Column(db.String(64),  nullable=True)

    def to_dict(self, member_name: Optional[str] = None) -> dict:
        return {
            "id":             self.id,
            "createdAt":      self.created_at.isoformat() + "Z" if self.created_at else None,
            "memberId":       self.member_id,
            "memberName":     member_name,
            "emailAttempted": self.email_attempted,
            "action":         self.action,
            "path":           self.path,
            "method":         self.method,
            "statusCode":     self.status_code,
            "ip":             self.ip,
            "userAgent":      self.user_agent,
            "sessionId":      self.session_id,
        }
