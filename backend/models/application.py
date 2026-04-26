from extensions import db
from datetime import datetime


class Application(db.Model):
    __tablename__ = "applications"

    id           = db.Column(db.Integer, primary_key=True)
    name         = db.Column(db.String(100), nullable=False)
    email        = db.Column(db.String(255), nullable=False)
    student_id   = db.Column(db.String(50),  nullable=False)
    year         = db.Column(db.String(20))
    phone        = db.Column(db.String(50))
    major        = db.Column(db.String(100))
    motivation   = db.Column(db.Text)
    status       = db.Column(db.String(20), default="pending")   # pending | approved | rejected
    applied_date = db.Column(db.DateTime,   default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":          self.id,
            "name":        self.name,
            "email":       self.email,
            "studentId":   self.student_id,
            "year":        self.year,
            "phone":       self.phone or "Not provided",
            "major":       self.major,
            "motivation":  self.motivation or "",
            "status":      self.status,
            "appliedDate": self.applied_date.isoformat(),
        }
