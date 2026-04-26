import json

from extensions import db, bcrypt
from datetime import datetime


class Member(db.Model):
    __tablename__ = "members"

    id            = db.Column(db.Integer, primary_key=True)
    name          = db.Column(db.String(100), nullable=False)
    email         = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    student_id    = db.Column(db.String(50))
    status        = db.Column(db.String(50), default="Active Member")
    is_admin      = db.Column(db.Boolean, default=False)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    # Profile fields (editable on profile.html). `year` mirrors the
    # original membership-application drop-down ("Year 1" … "Postgrad");
    # `major` is free-text. ``friends_json`` is the legacy storage from
    # the first iteration of the friends feature — the live source of
    # truth is now the FriendRequest table (status=accepted).
    year         = db.Column(db.String(50))
    major        = db.Column(db.String(100))
    phone        = db.Column(db.String(50))
    friends_json = db.Column(db.Text, default="[]", nullable=False)
    # Updated on every authenticated API request via app.before_request.
    last_seen    = db.Column(db.DateTime)
    # ``False`` while the applicant has not used their setup link yet.
    # ``True`` once they have chosen their password (via the email link
    # OR an admin manual-set fallback). Login is blocked while this is
    # ``False`` even if the random placeholder bcrypt is somehow guessed.
    password_set = db.Column(db.Boolean, default=False, nullable=False)

    # Relationship to progress (one member → one progress row per course)
    progress = db.relationship("Progress", backref="member", lazy=True, cascade="all, delete-orphan")

    # ---- Friends helper (JSON list of member IDs) ----------------------
    @property
    def friend_ids(self) -> list:
        try:
            ids = json.loads(self.friends_json or "[]")
        except (json.JSONDecodeError, TypeError):
            return []
        # Guard against junk in the column.
        return [int(i) for i in ids if isinstance(i, (int, str)) and str(i).isdigit()]

    @friend_ids.setter
    def friend_ids(self, ids):
        cleaned = []
        seen = set()
        for i in (ids or []):
            try:
                n = int(i)
            except (TypeError, ValueError):
                continue
            if n == self.id or n in seen:
                continue
            seen.add(n)
            cleaned.append(n)
        self.friends_json = json.dumps(cleaned)

    def set_password(self, plaintext: str):
        self.password_hash = bcrypt.generate_password_hash(plaintext).decode("utf-8")

    def check_password(self, plaintext: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, plaintext)

    def to_public_dict(self):
        """Safe representation for leaderboard (no sensitive fields).

        The leaderboard ranks members by TOTAL XP earned across every course
        they have taken — currently:
          * Linux Fundamentals          (course="linux"):   XP + 50 final-lab bonus
          * Network Fundamentals        (course="network"): XP
          * Web & App Fundamentals      (course="web"):     XP
          * Cybersecurity Ethics & Laws (course="ethics"):  XP (multi-choice quiz)
        Adding a new course in the future just means querying another row
        here and summing it in.
        """
        from models.progress import Progress

        linux = Progress.query.filter_by(member_id=self.id, course="linux").first()
        linux_xp    = linux.total_xp if linux else 0
        linux_tasks = len(linux.completed_tasks) if linux else 0
        linux_bonus = 50 if (linux and linux.lab_completed) else 0

        network = Progress.query.filter_by(member_id=self.id, course="network").first()
        network_xp    = network.total_xp if network else 0
        network_tasks = len(network.completed_tasks) if network else 0

        web = Progress.query.filter_by(member_id=self.id, course="web").first()
        web_xp    = web.total_xp if web else 0
        web_tasks = len(web.completed_tasks) if web else 0

        ethics = Progress.query.filter_by(member_id=self.id, course="ethics").first()
        ethics_xp    = ethics.total_xp if ethics else 0
        ethics_tasks = len(ethics.completed_tasks) if ethics else 0

        crypto = Progress.query.filter_by(member_id=self.id, course="crypto").first()
        crypto_xp    = crypto.total_xp if crypto else 0
        crypto_tasks = len(crypto.completed_tasks) if crypto else 0

        pentest = Progress.query.filter_by(member_id=self.id, course="pentest").first()
        pentest_xp    = pentest.total_xp if pentest else 0
        pentest_tasks = len(pentest.completed_tasks) if pentest else 0
        # Operation NightHawk capstone bonus (+75 XP) when lab_completed is
        # set by /api/progress/pentest/flag. Mirrors the Linux course's
        # 50-XP final-lab bonus.
        pentest_bonus = 75 if (pentest and pentest.lab_completed) else 0

        return {
            "id":             self.id,
            "name":           self.name,
            "points":         linux_xp + linux_bonus + network_xp + web_xp
                              + ethics_xp + crypto_xp + pentest_xp + pentest_bonus,
            "tasksCompleted": linux_tasks + network_tasks + web_tasks + ethics_tasks
                              + crypto_tasks + pentest_tasks,
            "linuxXP":        linux_xp + linux_bonus,
            "networkXP":      network_xp,
            "webXP":          web_xp,
            "ethicsXP":       ethics_xp,
            "cryptoXP":       crypto_xp,
            "pentestXP":      pentest_xp + pentest_bonus,
            "status":         self.status,
        }

    def to_admin_dict(self):
        """Full representation for admin panel."""
        # While the member hasn't completed the email-link setup yet we
        # display a virtual "Pending Password Setup" status. Login is
        # also blocked server-side until they finish.
        effective_status = self.status if self.password_set else "Pending Password Setup"
        return {
            "id":          self.id,
            "name":        self.name,
            "email":       self.email,
            "studentId":   self.student_id,
            "phone":       self.phone or "",
            "year":        self.year or "",
            "major":       self.major or "",
            "status":      effective_status,
            "passwordSet": bool(self.password_set),
            "isAdmin":     self.is_admin,
            "createdAt":   self.created_at.isoformat() + "Z" if self.created_at else None,
            "lastSeen":    self.last_seen.isoformat() + "Z" if self.last_seen else None,
            **{k: v for k, v in self.to_public_dict().items() if k not in ("id", "name", "status")},
        }

    def to_me_dict(self):
        """Representation for /api/auth/me (logged-in user's own view)."""
        return {
            "id":        self.id,
            "name":      self.name,
            "email":     self.email,
            "studentId": self.student_id,
            "status":    self.status,
            "isAdmin":   self.is_admin,
        }
