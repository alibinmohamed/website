from datetime import datetime
from typing import Optional

from extensions import db


class EventRegistration(db.Model):
    """One row per (event, member) RSVP. Created up-front so the table
    exists before the public registration UI lands; the registration
    endpoints currently return 501 until the flow is enabled.
    """

    __tablename__ = "event_registrations"
    __table_args__ = (
        db.UniqueConstraint("event_id", "member_id", name="uq_event_member"),
    )

    id         = db.Column(db.Integer, primary_key=True)
    event_id   = db.Column(db.Integer,
                           db.ForeignKey("events.id",  ondelete="CASCADE"),
                           nullable=False, index=True)
    member_id  = db.Column(db.Integer,
                           db.ForeignKey("members.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    status     = db.Column(db.String(20), default="registered", nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self, member_name: Optional[str] = None,
                member_email: Optional[str] = None) -> dict:
        return {
            "id":           self.id,
            "eventId":      self.event_id,
            "memberId":     self.member_id,
            "memberName":   member_name,
            "memberEmail":  member_email,
            "status":       self.status,
            "createdAt":    self.created_at.isoformat() + "Z" if self.created_at else None,
        }
