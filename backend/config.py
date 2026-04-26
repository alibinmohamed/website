import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # ── Database ──────────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "mysql+pymysql://root:password@localhost/cyberclub"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-me-in-production")
    JWT_ACCESS_TOKEN_EXPIRES_HOURS = int(os.environ.get("JWT_EXPIRES_HOURS", 24))

    # ── Admin ─────────────────────────────────────────────────────────────────
    # Store the HASHED admin password here (never the plaintext).
    # Generate with:  python3 -c "from flask_bcrypt import Bcrypt; b=Bcrypt(); print(b.generate_password_hash('yourpassword').decode())"
    ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")

    # ── Mail ─────────────────────────────────────────────────────────────────────
    MAIL_SERVER   = os.environ.get("MAIL_SERVER",   "smtp.gmail.com")
    MAIL_PORT     = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS  = os.environ.get("MAIL_USE_TLS",  "true").lower() == "true"
    MAIL_USE_SSL  = os.environ.get("MAIL_USE_SSL",  "false").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    # Falls back to MAIL_USERNAME so providers like Gmail accept the
    # message even when the admin forgets to set MAIL_DEFAULT_SENDER.
    MAIL_DEFAULT_SENDER = (
        os.environ.get("MAIL_DEFAULT_SENDER")
        or os.environ.get("MAIL_USERNAME")
        or ""
    )
    ADMIN_EMAIL   = os.environ.get("ADMIN_EMAIL",   "mutawa510@gmail.com")

    # ── App URL ─────────────────────────────────────────────────────────────────
    # Used to build absolute links in outgoing emails (e.g. the
    # set-password link). If unset, the backend falls back to
    # ``request.host_url``.
    APP_BASE_URL  = os.environ.get("APP_BASE_URL", "")

    # ── CORS ─────────────────────────────────────────────────────────────────────
    # In production set this to your actual frontend domain.
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
