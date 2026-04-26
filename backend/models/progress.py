from extensions import db
from datetime import datetime
import json


class Progress(db.Model):
    __tablename__ = "progress"

    id              = db.Column(db.Integer, primary_key=True)
    member_id       = db.Column(db.Integer, db.ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    course          = db.Column(db.String(50), default="linux")
    _completed_tasks = db.Column("completed_tasks", db.Text, default="[]")  # stored as JSON string
    total_xp        = db.Column(db.Integer, default=0)
    lab_completed   = db.Column(db.Boolean, default=False)
    last_updated    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── JSON helpers ──────────────────────────────────────────────────────────
    @property
    def completed_tasks(self):
        try:
            return json.loads(self._completed_tasks or "[]")
        except (ValueError, TypeError):
            return []

    @completed_tasks.setter
    def completed_tasks(self, value):
        self._completed_tasks = json.dumps(value if value is not None else [])

    def to_dict(self):
        return {
            "course":          self.course,
            "completedTasks":  self.completed_tasks,
            "totalXP":         self.total_xp,
            "labCompleted":    self.lab_completed,
            "lastUpdated":     self.last_updated.isoformat() if self.last_updated else None,
        }
