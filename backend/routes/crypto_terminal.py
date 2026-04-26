"""
crypto_terminal.py
------------------
WebSocket endpoint for the Cryptography course.

Spawns / attaches to a per-member ``cyber-crypto-{id}`` container running
the ``cyber-crypto`` image. Scores Enter-submitted lines against
crypto_tasks for the current chapter and emits

    { "type": "task-complete", id, xp, title, totalXP }

back to the WebSocket. Persists progress to ``Progress(course="crypto")``.
"""
import os
import sys
import subprocess
import struct
import fcntl
import termios
import threading
import json
import pty
import select
import re
import time
import hashlib
from flask import Blueprint, request

from crypto_tasks import score_line, xp_for

crypto_terminal_bp = Blueprint("crypto_terminal", __name__)

DOCKER_IMAGE = "cyber-crypto"
DOCKER_HOME_VOLUME_PREFIX = "cyber-crypto-home"
CONTAINER_NAME_PREFIX = "cyber-crypto"

_container_locks = {}
_container_locks_guard = threading.Lock()


def _member_lock(member_id):
    with _container_locks_guard:
        lock = _container_locks.get(member_id)
        if lock is None:
            lock = threading.Lock()
            _container_locks[member_id] = lock
        return lock


def _container_running(name):
    r = _docker_run(["docker", "inspect", "-f", "{{.State.Running}}", name])
    if r.returncode != 0:
        return None
    return "true" in r.stdout.lower()


def _decode_jwt_claims(token, app):
    from flask_jwt_extended import decode_token
    try:
        with app.app_context():
            decoded = decode_token(token)
            return decoded.get("sub"), decoded.get("name", ""), decoded.get("email", "")
    except Exception:
        return None, "", ""


def _make_username(name, email, member_id):
    base = (name or "").strip() or (email or "").split("@")[0] or f"member_{member_id}"
    username = re.sub(r"[^a-zA-Z0-9]+", "_", base.lower()).strip("_")
    return username or f"member_{member_id}"


def _build_guest_identity(guest_session_id, remote_addr):
    base = f"{remote_addr or 'unknown'}|{guest_session_id or 'anonymous'}"
    digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:12]
    return f"guest-{digest}", f"guest_{digest[:6]}"


def _load_member_context(app, member_id, fallback_name="", fallback_email=""):
    from models.member import Member

    member = None
    try:
        with app.app_context():
            member = Member.query.get(int(member_id))
    except Exception:
        member = None

    name = (member.name if member else fallback_name) or fallback_name or "cryptostudent"
    email = (member.email if member else fallback_email) or fallback_email or ""
    student_id = (member.student_id if member else "") or ""
    username = _make_username(name, email, member_id)

    return {
        "id": str(member_id),
        "name": name,
        "email": email,
        "student_id": student_id,
        "username": username,
    }


def _docker_run(args):
    return subprocess.run(args, capture_output=True, text=True)


def _ensure_container(member, chapter):
    """
    Ensure a cyber-crypto-{id} container is running. All chapters share the
    same container + home volume so generated key files persist across
    chapters (essential for chapters 7 and 8, which sign things created in
    chapter 7).
    """
    name = f"{CONTAINER_NAME_PREFIX}-{member['id']}"
    home_volume = f"{DOCKER_HOME_VOLUME_PREFIX}-{member['id']}"

    with _member_lock(member["id"]):
        running = _container_running(name)
        if running is None:
            run = _docker_run(
                [
                    "docker", "run", "-d",
                    "--name", name,
                    "--hostname", "crypto-lab",
                    "--user", "cryptostudent",
                    "--workdir", "/home/cryptostudent",
                    "--memory", "256m",
                    "--cpus", "0.5",
                    "--pids-limit", "256",
                    "--cap-drop", "ALL",
                    "--read-only",
                    "--tmpfs", "/tmp:size=32m",
                    "--tmpfs", "/home/cryptostudent/tmp:size=32m",
                    "-v", f"{home_volume}:/home/cryptostudent",
                    "-e", f"STUDENT_NAME={member['name']}",
                    "-e", f"STUDENT_USERNAME={member['username']}",
                    "-e", f"STUDENT_EMAIL={member['email']}",
                    "-e", f"MEMBER_ID={member['id']}",
                    "-e", f"STUDENT_ID={member['student_id']}",
                    DOCKER_IMAGE,
                    "sleep", "infinity",
                ]
            )
            if run.returncode != 0:
                if _container_running(name) is None:
                    print(
                        f"[crypto_terminal] docker run failed for {name}: "
                        f"{(run.stderr or run.stdout).strip()}",
                        file=sys.stderr,
                    )
        elif running is False:
            _docker_run(["docker", "start", name])

        for _ in range(30):
            if _container_running(name) is True:
                break
            time.sleep(0.1)

    return name


def _get_or_create_progress(app, member_id):
    from models.progress import Progress
    from extensions import db

    try:
        int(member_id)
    except (TypeError, ValueError):
        return None

    with app.app_context():
        prog = Progress.query.filter_by(member_id=int(member_id), course="crypto").first()
        if not prog:
            prog = Progress(member_id=int(member_id), course="crypto")
            prog.completed_tasks = []
            db.session.add(prog)
            db.session.commit()
        return prog


def _award_task(app, member_id, task):
    from models.progress import Progress
    from extensions import db

    try:
        int(member_id)
    except (TypeError, ValueError):
        return None, False

    with app.app_context():
        prog = Progress.query.filter_by(member_id=int(member_id), course="crypto").first()
        if not prog:
            prog = Progress(member_id=int(member_id), course="crypto")
            prog.completed_tasks = []
            db.session.add(prog)

        done = list(prog.completed_tasks or [])
        if task["id"] in done:
            return prog.total_xp or 0, False

        done.append(task["id"])
        prog.completed_tasks = done
        prog.total_xp = xp_for(done)
        db.session.commit()
        return prog.total_xp, True


def crypto_terminal_ws(ws):
    from flask import current_app
    app = current_app._get_current_object()

    member_id = "guest"
    member_name = "cryptostudent"
    member_email = ""
    guest_session_id = ""
    chapter = 1

    try:
        first_msg = ws.receive(timeout=5)
        if first_msg:
            msg = json.loads(first_msg)
            guest_session_id = msg.get("guestSessionId") or ""
            try:
                chapter = max(1, min(9, int(msg.get("chapter", 1))))
            except (TypeError, ValueError):
                chapter = 1
            if msg.get("type") == "auth" and msg.get("token"):
                identity, name, email = _decode_jwt_claims(msg["token"], app)
                if identity:
                    member_id = identity
                if name:
                    member_name = name
                if email:
                    member_email = email
    except Exception:
        pass

    if member_id == "guest":
        remote_addr = request.headers.get("X-Forwarded-For", request.remote_addr or "")
        member_id, member_name = _build_guest_identity(guest_session_id, remote_addr)

    member = _load_member_context(app, member_id, member_name, member_email)
    _get_or_create_progress(app, member_id)
    container_name = _ensure_container(member, chapter)

    try:
        ws.send(json.dumps({
            "type": "ready",
            "chapter": chapter,
            "container": container_name,
            "totalXP": xp_for((_get_or_create_progress(app, member_id).completed_tasks
                               if _get_or_create_progress(app, member_id) else [])),
        }))
    except Exception:
        pass

    master_fd, slave_fd = pty.openpty()

    process = subprocess.Popen(
        [
            "docker", "exec", "-it",
            "--user", "cryptostudent",
            "--workdir", "/home/cryptostudent",
            "-e", "TERM=xterm-256color",
            "-e", f"CR_CHAPTER={chapter}",
            "-e", f"STUDENT_NAME={member['name']}",
            "-e", f"STUDENT_USERNAME={member['username']}",
            "-e", f"STUDENT_EMAIL={member['email']}",
            "-e", f"MEMBER_ID={member['id']}",
            container_name,
            "/bin/bash", "-l",
        ],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True,
    )
    os.close(slave_fd)

    stop = threading.Event()
    line_buffer = [""]

    def _reader():
        while not stop.is_set():
            try:
                r, _, _ = select.select([master_fd], [], [], 0.05)
                if master_fd in r:
                    data = os.read(master_fd, 4096)
                    if data:
                        ws.send(data.decode("utf-8", errors="replace"))
                if process.poll() is not None:
                    break
            except Exception:
                break

    reader_thread = threading.Thread(target=_reader, daemon=True)
    reader_thread.start()

    def _maybe_score(line):
        task = score_line(chapter, line)
        if not task:
            return
        total_xp, newly_awarded = _award_task(app, member_id, task)
        try:
            ws.send(json.dumps({
                "type": "task-complete",
                "chapter": chapter,
                "id": task["id"],
                "xp": task["xp"],
                "title": task["title"],
                "totalXP": total_xp if total_xp is not None else xp_for([task["id"]]),
                "newlyAwarded": newly_awarded,
                "guest": member_id.startswith("guest-"),
            }))
        except Exception:
            pass

    def _on_input_bytes(data_str):
        for ch in data_str:
            code = ord(ch)
            if code in (13, 10):
                line = line_buffer[0]
                line_buffer[0] = ""
                if line.strip():
                    _maybe_score(line)
            elif code == 127:
                if line_buffer[0]:
                    line_buffer[0] = line_buffer[0][:-1]
            elif code == 3 or code == 21:
                line_buffer[0] = ""
            elif code >= 32:
                line_buffer[0] += ch

    try:
        while True:
            message = ws.receive()
            if message is None:
                break
            try:
                msg = json.loads(message)
                kind = msg.get("type")
                if kind == "auth":
                    continue
                elif kind == "input":
                    payload = msg.get("data", "")
                    os.write(master_fd, payload.encode("utf-8", errors="replace"))
                    _on_input_bytes(payload)
                elif kind == "resize":
                    rows = max(1, int(msg.get("rows", 24)))
                    cols = max(1, int(msg.get("cols", 80)))
                    fcntl.ioctl(
                        master_fd, termios.TIOCSWINSZ,
                        struct.pack("HHHH", rows, cols, 0, 0),
                    )
            except (json.JSONDecodeError, TypeError, KeyError):
                os.write(master_fd, message.encode("utf-8", errors="replace"))
                _on_input_bytes(message)
    except Exception:
        pass
    finally:
        stop.set()
        try:
            process.terminate()
            try:
                process.wait(timeout=1.5)
            except Exception:
                process.kill()
        except Exception:
            pass
        try:
            os.close(master_fd)
        except Exception:
            pass
