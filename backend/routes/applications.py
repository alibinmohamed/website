import html
import re
import secrets

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt
from flask_mail import Message
from extensions import db, mail
from models.application import Application
from models.member import Member
from models.progress import Progress
from models.password_reset_token import PasswordResetToken

applications_bp = Blueprint("applications", __name__)


# Validation rules for /api/applications POST. Mirrors the rules the
# join.html form enforces on the client — we re-check on the server so
# anyone bypassing the form (curl, scripts, etc.) is still rejected.
_NAME_RE        = re.compile(r"^\s*\S+\s+\S+")           # at least 2 words
_EMAIL_RE       = re.compile(r"^[^\s@]+@utb\.edu\.bh$", re.IGNORECASE)
_STUDENT_ID_RE  = re.compile(r"^bh[A-Za-z0-9]+$",        re.IGNORECASE)
# Phone may be the empty string. Otherwise we accept "+<dial> <digits>"
# where <dial> is any 1–4 digit ITU-style country code. The join form
# lists GCC codes first then the full world set, so any selection in
# the dropdown is valid.
_PHONE_RE       = re.compile(
    r"^(?P<code>\+\d{1,4})\s+(?P<num>\d{6,12})$"
)


def _validate_application(payload):
    """Return ``(cleaned, errors)`` where ``cleaned`` is a dict of
    sanitized fields and ``errors`` is a ``{field: msg}`` mapping. When
    ``errors`` is empty the cleaned dict is safe to persist."""
    errors = {}

    name = (payload.get("name") or "").strip()
    if not name:
        errors["name"] = "Full name is required."
    elif not _NAME_RE.match(name):
        errors["name"] = "Enter your first and last name."

    email = (payload.get("email") or "").strip().lower()
    if not email:
        errors["email"] = "University email is required."
    elif not _EMAIL_RE.match(email):
        errors["email"] = "Use your @utb.edu.bh email address."

    student_id = (payload.get("studentId") or "").strip()
    if not student_id:
        errors["studentId"] = "Student ID is required."
    elif not _STUDENT_ID_RE.match(student_id):
        errors["studentId"] = "Student ID must start with \u201Cbh\u201D."

    phone = (payload.get("phone") or "").strip()
    if phone:
        m = _PHONE_RE.match(phone)
        if not m:
            errors["phoneNumber"] = "Phone must be in the form \u201C+<code> <digits>\u201D."
        # Any valid 1–4 digit dial code is accepted (GCC codes appear
        # first in the dropdown but the full world list is offered).

    cleaned = {
        "name":       html.escape(name),
        "email":      email,                 # already lowercased; keep simple
        "studentId":  html.escape(student_id),
        "year":       html.escape((payload.get("year")  or "").strip()),
        "phone":      html.escape(phone),
        "major":      html.escape((payload.get("major") or "").strip()),
        "motivation": html.escape((payload.get("motivation") or "").strip()),
    }
    return cleaned, errors


def _admin_required():
    """Returns (claims, error_response). If error_response is not None, return it immediately."""
    from flask_jwt_extended import verify_jwt_in_request
    try:
        verify_jwt_in_request()
        claims = get_jwt()
        if not claims.get("is_admin"):
            return None, (jsonify({"error": "Admin access required"}), 403)
        return claims, None
    except Exception:
        return None, (jsonify({"error": "Missing or invalid token"}), 401)


def _send_new_application_email(app_obj):
    """Send notification email to admin when a new application arrives."""
    try:
        admin_email = current_app.config.get("ADMIN_EMAIL")
        if not admin_email or not current_app.config.get("MAIL_USERNAME"):
            return  # Mail not configured — skip silently
        msg = Message(
            subject=f"New Club Application from {app_obj.name}",
            recipients=[admin_email],
            body=(
                f"New application received!\n\n"
                f"Name:       {app_obj.name}\n"
                f"Email:      {app_obj.email}\n"
                f"Student ID: {app_obj.student_id}\n"
                f"Year:       {app_obj.year}\n"
                f"Major:      {app_obj.major}\n"
                f"Phone:      {app_obj.phone or 'Not provided'}\n\n"
                f"Motivation:\n{app_obj.motivation or 'Not provided'}\n\n"
                f"Log in to the admin panel to review this application."
            )
        )
        mail.send(msg)
    except Exception as e:
        current_app.logger.warning(f"Email send failed: {e}")


@applications_bp.route("", methods=["POST"])
def submit_application():
    """Public: submit a membership application.

    Validation rules (mirrored on the client in join.html / app.js):
    * ``name``       — at least two words.
    * ``email``      — must end with ``@utb.edu.bh``.
    * ``studentId``  — must start with ``bh``.
    * ``phone``      — optional; if provided must be ``+<dial> <digits>``
      where ``<dial>`` is any 1–4 digit ITU country code.
    """
    data = request.get_json(silent=True) or {}
    cleaned, errors = _validate_application(data)
    if errors:
        return jsonify({
            "error":  "Please fix the highlighted fields.",
            "fields": errors,
        }), 400

    email      = cleaned["email"]
    student_id = cleaned["studentId"]

    # Prevent duplicate applications from the same email
    existing = Application.query.filter_by(email=email, status="pending").first()
    if existing:
        return jsonify({"error": "An application for this email is already pending"}), 409

    # Also block if already a member
    if Member.query.filter_by(email=email).first():
        return jsonify({"error": "This email is already registered as a member"}), 409

    app_obj = Application(
        name=cleaned["name"],
        email=email,
        student_id=student_id,
        year=cleaned["year"],
        phone=cleaned["phone"],
        major=cleaned["major"],
        motivation=cleaned["motivation"],
    )
    db.session.add(app_obj)
    db.session.commit()

    _send_new_application_email(app_obj)
    return jsonify({"message": "Application submitted successfully", "id": app_obj.id}), 201


@applications_bp.route("", methods=["GET"])
def list_applications():
    """Admin: list all pending applications."""
    claims, err = _admin_required()
    if err:
        return err

    status = request.args.get("status", "pending")
    apps   = Application.query.filter_by(status=status).order_by(Application.applied_date.desc()).all()
    return jsonify([a.to_dict() for a in apps]), 200


def _setup_link(token: str) -> str:
    """Build the public set-password URL for ``token``.

    Honours an explicit ``APP_BASE_URL`` config value, otherwise falls
    back to the host the request came in on (admin browser — same
    origin as the front-end in our deployment).
    """
    base = (current_app.config.get("APP_BASE_URL") or "").rstrip("/")
    if not base:
        # request.host_url ends with a trailing slash; strip ``/api/`` if
        # the admin happened to hit us via the API host.
        base = (request.host_url or "").rstrip("/")
    return f"{base}/set-password.html?token={token}"


def _send_setup_password_email(member: Member, link: str) -> bool:
    """Email the applicant the one-time setup link. Returns True on send,
    False if mail isn't configured (caller still gets the link in the
    HTTP response so it can be hand-delivered)."""
    try:
        if not current_app.config.get("MAIL_USERNAME"):
            current_app.logger.info(
                "[password-setup] Mail not configured. Link for %s: %s",
                member.email, link,
            )
            return False
        msg = Message(
            subject="Your application has been approved",
            recipients=[member.email],
            body=(
                "Hello,\n\n"
                "Your application has been approved.\n\n"
                "Please click the link below to complete your account setup:\n\n"
                f"{link}\n\n"
                "This link will expire in 24 hours.\n\n"
                "Thank you."
            ),
        )
        mail.send(msg)
        return True
    except Exception as e:
        current_app.logger.warning(f"Setup-password email failed: {e}")
        return False


@applications_bp.route("/<int:app_id>/approve", methods=["POST"])
def approve_application(app_id):
    """Admin: approve an application.

    Creates the member account in a *pending-password* state and emails
    the applicant a one-time link they use to choose their password.
    The admin no longer types the password — it stays known only to the
    new member.
    """
    claims, err = _admin_required()
    if err:
        return err

    app_obj = Application.query.get_or_404(app_id)
    if app_obj.status != "pending":
        return jsonify({"error": "Application is not pending"}), 400

    # Prevent duplicate member
    if Member.query.filter_by(email=app_obj.email).first():
        return jsonify({"error": "A member with this email already exists"}), 409

    member = Member(
        name=app_obj.name,
        email=app_obj.email,
        student_id=app_obj.student_id,
        # Carry over the year/major/phone the applicant filled in on
        # join.html so their profile page (and the admin panel) is
        # pre-populated on first login.
        year=app_obj.year or None,
        major=app_obj.major or None,
        phone=app_obj.phone or None,
        status="Active Member",
        is_admin=False,
        password_set=False,   # admin still has to wait for the email link.
    )
    # The user can't log in yet — they have to come through the
    # set-password link first. We still satisfy the NOT NULL constraint
    # on password_hash with a random unguessable bcrypt.
    member.set_password(secrets.token_urlsafe(32))
    db.session.add(member)
    db.session.flush()  # get member.id before commit

    # Create initial progress row
    prog = Progress(member_id=member.id, course="linux")
    prog.completed_tasks = []
    db.session.add(prog)

    # Mint the password-setup token + build the link the applicant
    # clicks to finish onboarding.
    _, raw_token = PasswordResetToken.issue(member_id=member.id, purpose="setup")
    link = _setup_link(raw_token)

    app_obj.status = "approved"
    db.session.commit()

    emailed = _send_setup_password_email(member, link)
    return jsonify({
        "message":   f"Account created for {member.name}",
        "memberId":  member.id,
        "emailSent": emailed,
        # Return the link too so the admin UI can copy it as a fallback
        # when SMTP isn't wired up yet.
        "setupLink": link,
    }), 201


@applications_bp.route("/<int:app_id>", methods=["DELETE"])
def reject_application(app_id):
    """Admin: reject (delete) an application."""
    claims, err = _admin_required()
    if err:
        return err

    app_obj = Application.query.get_or_404(app_id)
    db.session.delete(app_obj)
    db.session.commit()
    return jsonify({"message": "Application rejected and removed"}), 200
