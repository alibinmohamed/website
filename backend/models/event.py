from datetime import datetime

from extensions import db


class Event(db.Model):
    """Admin-managed event listing. Surfaced both on the public events
    page and on the admin portal. ``image_path`` is server-relative
    (``uploads/events/<id>.<ext>``) and is served by the dedicated
    ``/uploads/...`` route registered in ``app.py``.
    """

    __tablename__ = "events"

    id          = db.Column(db.Integer, primary_key=True)
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text,        nullable=True)
    image_path  = db.Column(db.String(255), nullable=True)
    location    = db.Column(db.String(255), nullable=True)
    starts_at   = db.Column(db.DateTime,    nullable=False, index=True)
    ends_at     = db.Column(db.DateTime,    nullable=True)
    created_by  = db.Column(db.String(100), nullable=True)
    created_at  = db.Column(db.DateTime,    default=datetime.utcnow, nullable=False)
    updated_at  = db.Column(db.DateTime,    default=datetime.utcnow,
                            onupdate=datetime.utcnow, nullable=False)

    @staticmethod
    def _iso(dt):
        if dt is None:
            return None
        return dt.isoformat() + "Z"

    def to_public_dict(self) -> dict:
        return {
            "id":          self.id,
            "title":       self.title,
            "description": self.description or "",
            "imageUrl":    f"/{self.image_path}" if self.image_path else None,
            "location":    self.location or "",
            "startsAt":    self._iso(self.starts_at),
            "endsAt":      self._iso(self.ends_at),
        }

    def to_admin_dict(self, registrations_count: int = 0) -> dict:
        d = self.to_public_dict()
        d.update({
            "createdBy":          self.created_by or "admin",
            "createdAt":          self._iso(self.created_at),
            "updatedAt":          self._iso(self.updated_at),
            "registrationsCount": registrations_count,
        })
        return d
