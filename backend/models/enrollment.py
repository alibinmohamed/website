"""
Enrollment model.

Tracks which courses a member has *explicitly* enrolled in. Separate from
the ``Progress`` table because progress can exist without enrollment
(e.g. legacy users from before this feature shipped); the dashboard
gates which course cards are shown based on the rows here.

Course strings are constrained at the API layer
(:const:`routes.progress.PREREQUISITES`) to:

    ethics, linux, network, crypto, web, pentest
"""
from datetime import datetime

from extensions import db


class Enrollment(db.Model):
    __tablename__ = "enrollments"

    id          = db.Column(db.Integer, primary_key=True)
    member_id   = db.Column(
        db.Integer,
        db.ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    course      = db.Column(db.String(20), nullable=False)
    enrolled_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("member_id", "course", name="uq_enrollments_member_course"),
    )

    def to_dict(self):
        return {
            "course":     self.course,
            "enrolledAt": self.enrolled_at.isoformat() if self.enrolled_at else None,
        }
