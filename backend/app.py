import os

from flask import Flask, request as flask_request, send_from_directory, abort
from flask_cors import CORS
from datetime import datetime, timedelta
from sqlalchemy import inspect, text

from config import Config
from extensions import db, jwt, bcrypt, mail, sock

# Where event images (and any future uploads) live on disk. Served by
# the /uploads/<...> route below.
UPLOADS_ROOT = os.path.join(os.path.dirname(__file__), "uploads")


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # JWT token expiry from config
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        hours=app.config["JWT_ACCESS_TOKEN_EXPIRES_HOURS"]
    )

    # Init extensions
    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    mail.init_app(app)
    sock.init_app(app)
    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    # Register blueprints
    from routes.auth              import auth_bp
    from routes.applications      import applications_bp
    from routes.members           import members_bp
    from routes.progress          import progress_bp
    from routes.admin             import admin_bp
    from routes.events            import events_bp
    from routes.notifications     import notifications_bp
    from routes.terminal          import terminal_bp, terminal_ws
    from routes.network_terminal  import network_terminal_bp, network_terminal_ws
    from routes.web_terminal      import web_terminal_bp, web_terminal_ws
    from routes.crypto_terminal   import crypto_terminal_bp, crypto_terminal_ws
    from routes.pentest_terminal  import pentest_terminal_bp, pentest_terminal_ws
    from routes.pentest_desktop   import pentest_desktop_bp

    app.register_blueprint(auth_bp,              url_prefix="/api/auth")
    app.register_blueprint(applications_bp,      url_prefix="/api/applications")
    app.register_blueprint(members_bp,           url_prefix="/api/members")
    app.register_blueprint(progress_bp,          url_prefix="/api/progress")
    app.register_blueprint(admin_bp,             url_prefix="/api/admin")
    app.register_blueprint(events_bp,            url_prefix="/api/events")
    app.register_blueprint(notifications_bp,     url_prefix="/api/notifications")
    app.register_blueprint(terminal_bp)
    app.register_blueprint(network_terminal_bp)
    app.register_blueprint(web_terminal_bp)
    app.register_blueprint(crypto_terminal_bp)
    app.register_blueprint(pentest_terminal_bp)
    app.register_blueprint(pentest_desktop_bp,   url_prefix="/api/pentest-desktop")

    # WebSocket endpoints
    sock.route("/api/terminal")(terminal_ws)
    sock.route("/api/network-terminal")(network_terminal_ws)
    sock.route("/api/web-terminal")(web_terminal_ws)
    sock.route("/api/crypto-terminal")(crypto_terminal_ws)
    sock.route("/api/pentest-terminal")(pentest_terminal_ws)

    # Create tables on first run
    with app.app_context():
        from models import (  # noqa: F401
            member, application, progress, enrollment, friend_request,
            audit_log, event, event_registration, password_reset_token,
        )
        db.create_all()
        _migrate_member_schema()
        _seed_default_members(app)

    # Make sure the uploads dir exists so event-image POSTs don't fail
    # on a fresh install.
    os.makedirs(os.path.join(UPLOADS_ROOT, "events"), exist_ok=True)

    # Public static serving for uploaded files (event images, etc.).
    @app.route("/uploads/<path:relpath>")
    def _serve_upload(relpath):  # noqa: D401
        # send_from_directory already protects against path traversal.
        full = os.path.join(UPLOADS_ROOT, relpath)
        if not os.path.isfile(full):
            abort(404)
        directory, filename = os.path.split(full)
        return send_from_directory(directory, filename)

    # Bump ``last_seen`` on every authenticated API call so the friends
    # list can show "Last seen …" timestamps. Wrapped in a defensive
    # try/except so a bug here can never break the request — it's purely
    # a side-channel update.
    @app.before_request
    def _touch_last_seen():
        from flask_jwt_extended import (
            verify_jwt_in_request, get_jwt_identity, get_jwt,
        )
        from models.member import Member

        # Only authenticated API calls. CORS preflight OPTIONS requests
        # never carry credentials, so skip them.
        if not (flask_request.path or "").startswith("/api/"):
            return
        if flask_request.method == "OPTIONS":
            return
        # The login / admin-login endpoints are public — no point trying
        # to decode a JWT for them either.
        if flask_request.path in ("/api/auth/login", "/api/auth/admin-login"):
            return

        try:
            jwt_data = verify_jwt_in_request(optional=True)
        except Exception:
            return  # Bad / expired token — the route handler will reject.
        # ``optional=True`` returns ``None`` when no JWT was provided, in
        # which case ``get_jwt_identity()`` would raise. Bail early.
        if jwt_data is None:
            return

        try:
            identity = get_jwt_identity()
            claims   = get_jwt() or {}
        except Exception:
            return
        if not identity or claims.get("is_admin"):
            return

        try:
            member = Member.query.get(int(identity))
            if member:
                member.last_seen = datetime.utcnow()
                db.session.commit()
        except Exception:
            db.session.rollback()  # Never break the request.

    # Audit firehose: log every authenticated /api/ call. Login attempts
    # are recorded by the auth blueprint itself with richer context.
    @app.after_request
    def _audit_request(response):
        from flask_jwt_extended import get_jwt_identity, get_jwt
        from routes._audit import (
            record, session_id, should_skip_request_logging, _SESSION_COOKIE,
        )

        # Always (re-)issue the session cookie so subsequent requests
        # carry a stable id. 1-year lifetime, HttpOnly, SameSite=Lax.
        try:
            sid = session_id()
            if flask_request.cookies.get(_SESSION_COOKIE) != sid:
                response.set_cookie(
                    _SESSION_COOKIE, sid,
                    max_age=60 * 60 * 24 * 365,
                    httponly=True, samesite="Lax",
                )
        except Exception:
            pass

        try:
            if should_skip_request_logging():
                return response
            member_id = None
            try:
                identity = get_jwt_identity()
                claims   = get_jwt() or {}
                if identity and not claims.get("is_admin"):
                    member_id = int(identity)
            except Exception:
                pass
            record(
                "api_request",
                member_id=member_id,
                status_code=response.status_code,
            )
        except Exception:
            pass
        return response

    return app


def _migrate_member_schema():
    """Add ``year``, ``major`` and ``friends_json`` columns to ``members``
    when running against a database that pre-dates the profile feature.

    SQLAlchemy's ``create_all`` only creates *new* tables — it never adds
    columns to existing ones — so we do a tiny in-place migration here.
    Idempotent: re-running is a no-op once the columns exist.

    MySQL forbids ``DEFAULT`` on ``TEXT`` columns, so ``friends_json`` is
    added as nullable and backfilled with ``'[]'`` in the same
    transaction. The ORM-level ``default='[]'`` keeps new rows populated.
    """
    inspector = inspect(db.engine)
    if "members" not in inspector.get_table_names():
        return  # Brand-new DB; create_all already built the full schema.

    existing = {c["name"] for c in inspector.get_columns("members")}
    statements = []
    if "year" not in existing:
        statements.append("ALTER TABLE members ADD COLUMN year VARCHAR(50)")
    if "major" not in existing:
        statements.append("ALTER TABLE members ADD COLUMN major VARCHAR(100)")
    if "phone" not in existing:
        statements.append("ALTER TABLE members ADD COLUMN phone VARCHAR(50)")
    add_friends = "friends_json" not in existing
    if add_friends:
        statements.append("ALTER TABLE members ADD COLUMN friends_json TEXT")
    if "last_seen" not in existing:
        statements.append("ALTER TABLE members ADD COLUMN last_seen DATETIME")
    add_password_set = "password_set" not in existing
    if add_password_set:
        # Add as nullable so the ALTER doesn't fail on populated tables,
        # backfill every existing row to TRUE (those members already chose
        # a password before this column existed), then enforce NOT NULL.
        statements.append("ALTER TABLE members ADD COLUMN password_set TINYINT(1)")

    if not statements:
        return

    with db.engine.begin() as conn:
        for sql in statements:
            conn.execute(text(sql))
        if add_friends:
            # Backfill any pre-existing rows that picked up a NULL when the
            # column was created.
            conn.execute(text(
                "UPDATE members SET friends_json = '[]' WHERE friends_json IS NULL"
            ))
        if add_password_set:
            conn.execute(text(
                "UPDATE members SET password_set = 1 WHERE password_set IS NULL"
            ))
            conn.execute(text(
                "ALTER TABLE members MODIFY COLUMN password_set TINYINT(1) NOT NULL DEFAULT 0"
            ))
    print("✅ Migrated members table:", ", ".join(statements))


def _seed_default_members(app):
    """Insert the demo members if the members table is empty."""
    from models.member   import Member
    from models.progress import Progress

    if Member.query.count() == 0:
        defaults = [
            {"name": "Alya Hassan",  "email": "alya@utb.edu",   "password": "alya123",   "student_id": "20230001"},
            {"name": "Yousef Adel",  "email": "yousef@utb.edu",  "password": "yousef123",  "student_id": "20230002"},
            {"name": "Maha Tariq",   "email": "maha@utb.edu",    "password": "maha123",    "student_id": "20230003"},
        ]
        for d in defaults:
            m = Member(
                name=d["name"],
                email=d["email"],
                student_id=d["student_id"],
                status="Active Member",
                is_admin=False,
                password_set=True,   # demo members get a real password.
            )
            m.set_password(d["password"])
            db.session.add(m)
            db.session.flush()  # get m.id before commit

            # Create a blank progress row for every seeded member
            prog = Progress(member_id=m.id, course="linux")
            prog.completed_tasks = []
            db.session.add(prog)

        db.session.commit()
        print("✅ Seeded default demo members with progress rows.")


# ── Entry point ───────────────────────────────────────────────────────────────
app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5001)

