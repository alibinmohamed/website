import os
import subprocess
import struct
import fcntl
import termios
import threading
import json
import pty
import select
import re
import hashlib
from flask import Blueprint, request

terminal_bp = Blueprint("terminal", __name__)

DOCKER_IMAGE = "cyber-student"
DOCKER_HOME_VOLUME_PREFIX = "cyber-student-home"


def _decode_jwt_claims(token, app):
    """Decode a JWT token and return (member_id, member_name, member_email)."""
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

    name = (member.name if member else fallback_name) or fallback_name or "guest"
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


def _sync_member_home(container_name, member):
    """
    Initialize and refresh the member's personal home directory inside the
    persistent volume mounted at /home/student.
    """
    sync_script = r'''
mkdir -p "$HOME/Documents" "$HOME/Downloads" "$HOME/Desktop" "$HOME/projects" "$HOME/private" "$HOME/challenges"

cat > "$HOME/member-profile.txt" <<EOF
Member Name: $STUDENT_NAME
Username: $STUDENT_USERNAME
Email: $STUDENT_EMAIL
Member ID: $MEMBER_ID
Student ID: $STUDENT_ID
EOF

cat > "$HOME/.member_env" <<EOF
STUDENT_NAME=$STUDENT_NAME
STUDENT_USERNAME=$STUDENT_USERNAME
STUDENT_EMAIL=$STUDENT_EMAIL
MEMBER_ID=$MEMBER_ID
STUDENT_ID=$STUDENT_ID
EOF

mkdir -p "$HOME/.cyberclub_bin"

cat > "$HOME/.cyberclub_bin/whoami" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "${STUDENT_NAME:-student}"
EOF

cat > "$HOME/.cyberclub_bin/id" <<'EOF'
#!/usr/bin/env bash
if [ "$#" -gt 0 ]; then
  exec /usr/bin/id "$@"
fi
printf 'uid=1000(%s) gid=1000(%s) groups=1000(%s)\n' \
  "${STUDENT_NAME:-student}" "${STUDENT_NAME:-student}" "${STUDENT_NAME:-student}"
EOF

cat > "$HOME/.cyberclub_bin/ls" <<'EOF'
#!/usr/bin/env bash
hide_dockerenv=0

if [ "$#" -eq 0 ] && [ "$(pwd)" = "/" ]; then
  hide_dockerenv=1
fi

for arg in "$@"; do
  case "$arg" in
    -*) ;;
    /|/.) hide_dockerenv=1 ;;
  esac
done

output="$(/usr/bin/ls "$@" 2>&1)"
status=$?
if [ $status -ne 0 ]; then
  printf '%s\n' "$output"
  exit $status
fi

if [ "$hide_dockerenv" -eq 1 ]; then
  printf '%s\n' "$output" | awk '!($0==".dockerenv" || $0 ~ /[[:space:]]\.dockerenv$/)'
else
  printf '%s\n' "$output"
fi
EOF

chmod 755 "$HOME/.cyberclub_bin/whoami" "$HOME/.cyberclub_bin/id" "$HOME/.cyberclub_bin/ls"

cat > "$HOME/.cyberclub_shellrc" <<'EOF'
export TERM=xterm-256color
export PATH="$HOME/.cyberclub_bin:$PATH"
PS1='\[\e[0;32m\]${STUDENT_NAME:-student}@linux\[\e[0m\]:\[\e[0;34m\]\w\[\e[0m\]\$ '
EOF

touch "$HOME/.bashrc"
grep -qxF '[ -f "$HOME/.cyberclub_shellrc" ] && . "$HOME/.cyberclub_shellrc"' "$HOME/.bashrc" || \
  printf '\n[ -f "$HOME/.cyberclub_shellrc" ] && . "$HOME/.cyberclub_shellrc"\n' >> "$HOME/.bashrc"

cat > "$HOME/Desktop/start-here.txt" <<EOF
Welcome, $STUDENT_NAME

This is your personal Linux environment.
Files you create here belong only to you.
Other members have separate containers and separate home directories.
EOF

mkdir -p "$HOME/challenges/final-lab"

cat > "$HOME/challenges/README.txt" <<'EOF'
Challenge Workspace

This directory contains the final capstone challenge.
Navigate to final-lab/ to begin your investigation.

Use: find, cat, grep, tar, ls -la
EOF

cat > "$HOME/challenges/final-lab/README.txt" <<'EOF'
=== OPERATION NIGHTFALL ===
Cybersecurity Club UTB — Final Capstone Lab

Briefing:
A suspicious process was detected on one of the university servers.
As a junior SOC analyst, your mission is to investigate the
compromised directory, analyze the evidence, and capture the
flag hidden by the forensic team.

Objectives:
1. Extract the mission archive (mission.tar)
2. Investigate the incident logs
3. Locate hidden evidence directories
4. Recover the hidden flag

Flag format: UTB{...}

Good luck, analyst.
EOF

rm -rf "$HOME/challenges/final-lab/extracted"
rm -f "$HOME/challenges/final-lab/mission.tar"
tmp_lab_dir="$HOME/challenges/final-lab/.tmp-build"
rm -rf "$tmp_lab_dir"

# Build the scenario directory structure
mkdir -p "$tmp_lab_dir/extracted/config"
mkdir -p "$tmp_lab_dir/extracted/.evidence/.flag"

cat > "$tmp_lab_dir/extracted/hint.txt" <<'EOF'
ANALYST HINT — Operation Nightfall

The forensic team left the flag in a hidden directory.
Search deeper — use find and grep to locate it.

Tip: Hidden directories start with a dot. Try ls -la inside extracted/.
The flag follows the format UTB{...}
EOF

cat > "$tmp_lab_dir/extracted/incident.log" <<'EOF'
[2026-04-01 02:14:33] WARN  Unauthorized access attempt from 10.0.0.47
[2026-04-01 02:14:45] ERROR SSH login failure for user 'admin'
[2026-04-01 02:15:02] WARN  Port scan detected on interface eth0
[2026-04-01 02:15:18] CRIT  Privilege escalation attempt blocked
[2026-04-01 02:15:44] INFO  Forensic team flagged directory: .evidence
[2026-04-01 02:16:01] INFO  Evidence container sealed at .evidence/.flag/
[2026-04-01 02:16:10] INFO  Recovery token stored — search for UTB pattern
EOF

cat > "$tmp_lab_dir/extracted/config/server.conf" <<'EOF'
# Server Configuration — UTB SOC Lab
HOSTNAME=lab-server-01
ENV=investigation
FLAG_LOCATION=.evidence/.flag/flag.txt
ACCESS_LOG=.evidence/access.log
# DO NOT MODIFY — forensic snapshot
EOF

cat > "$tmp_lab_dir/extracted/.evidence/access.log" <<'EOF'
[02:15:55] Forensic analyst accessed: /home/student/challenges/final-lab
[02:16:00] Evidence sealed in: .evidence/.flag/
[02:16:05] Token written. Retrieve with: cat extracted/.evidence/.flag/flag.txt
EOF

cat > "$tmp_lab_dir/extracted/.evidence/.flag/flag.txt" <<'EOF'
UTB{linux_foundations_mastered}
EOF

chmod 600 "$tmp_lab_dir/extracted/.evidence/.flag/flag.txt"
chmod 700 "$tmp_lab_dir/extracted/.evidence/.flag"

tar -cvf "$HOME/challenges/final-lab/mission.tar" -C "$tmp_lab_dir" extracted >/dev/null 2>&1
rm -rf "$tmp_lab_dir"

if [ ! -f "$HOME/.cyberclub_initialized" ]; then
  printf 'Welcome, %s\n\nThis file belongs only to your account.\n' "$STUDENT_NAME" > "$HOME/welcome.txt"
  printf 'Owner: %s\nEmail: %s\nMember ID: %s\n' "$STUDENT_NAME" "$STUDENT_EMAIL" "$MEMBER_ID" > "$HOME/private/member-info.txt"
  printf 'Personal notes for %s\n' "$STUDENT_NAME" > "$HOME/Documents/${STUDENT_USERNAME}-notes.txt"
  printf 'Challenge workspace for %s\n' "$STUDENT_NAME" > "$HOME/challenges/README.txt"
  mkdir -p "$HOME/projects/$STUDENT_USERNAME-lab"
  printf '# %s workspace\n' "$STUDENT_NAME" > "$HOME/projects/$STUDENT_USERNAME-lab/README.md"
  touch "$HOME/.cyberclub_initialized"
fi
'''

    _docker_run(
        [
            "docker", "exec",
            "--user", "student",
            "-e", f"STUDENT_NAME={member['name']}",
            "-e", f"STUDENT_USERNAME={member['username']}",
            "-e", f"STUDENT_EMAIL={member['email']}",
            "-e", f"MEMBER_ID={member['id']}",
            "-e", f"STUDENT_ID={member['student_id']}",
            container_name,
            "bash", "-lc", sync_script,
        ]
    )


def _ensure_container(member):
    """
    Make sure a Docker container named cyber-student-{member_id} is running.
    If it doesn't exist, create it.  If it's stopped, start it.
    Returns the container name.
    """
    name = f"cyber-student-{member['id']}"
    home_volume = f"{DOCKER_HOME_VOLUME_PREFIX}-{member['id']}"

    # Check if container already exists
    result = _docker_run(
        ["docker", "inspect", "-f", "{{.State.Running}}", name],
    )

    if result.returncode != 0:
        # Container doesn't exist — create it
        _docker_run(
            [
                "docker", "run", "-d",
                "--name", name,
                "--hostname", "linux",
                "--user", "student",
                "--workdir", "/home/student",
                "--memory", "128m",
                "--cpus", "0.5",
                "--network", "none",
                "--read-only",
                "--tmpfs", "/tmp:size=32m",
                "-v", f"{home_volume}:/home/student",
                "-e", f"STUDENT_NAME={member['name']}",
                "-e", f"STUDENT_USERNAME={member['username']}",
                "-e", f"STUDENT_EMAIL={member['email']}",
                "-e", f"MEMBER_ID={member['id']}",
                "-e", f"STUDENT_ID={member['student_id']}",
                DOCKER_IMAGE,
                "sleep", "infinity",
            ]
        )
    elif "false" in result.stdout.lower():
        # Container exists but is stopped — restart it
        _docker_run(["docker", "start", name])

    _sync_member_home(name, member)

    return name


def terminal_ws(ws):
    """
    WebSocket handler — authenticates via JWT, then attaches to a
    per-user Docker container running real Linux.
    """
    from flask import current_app
    app = current_app._get_current_object()

    # ── Step 1: Wait for auth message with JWT token ──────────────────────
    member_id = "guest"
    member_name = "guest"
    member_email = ""
    guest_session_id = ""
    try:
        first_msg = ws.receive(timeout=5)
        if first_msg:
            msg = json.loads(first_msg)
            guest_session_id = msg.get("guestSessionId") or ""
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

    # ── Step 2: Ensure a Docker container is running for this member ──────
    member = _load_member_context(app, member_id, member_name, member_email)
    container_name = _ensure_container(member)

    # ── Step 3: Attach an interactive bash shell via PTY ──────────────────
    master_fd, slave_fd = pty.openpty()

    process = subprocess.Popen(
        [
            "docker", "exec", "-it",
            "--user", "student",
            "--workdir", "/home/student",
            "-e", "TERM=xterm-256color",
            "-e", f"STUDENT_NAME={member['name']}",
            "-e", f"STUDENT_USERNAME={member['username']}",
            "-e", f"STUDENT_EMAIL={member['email']}",
            "-e", f"MEMBER_ID={member['id']}",
            "-e", f"STUDENT_ID={member['student_id']}",
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

    def _reader():
        """Forward container PTY output → WebSocket."""
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
                    os.write(master_fd, msg["data"].encode("utf-8", errors="replace"))
                elif kind == "resize":
                    rows = max(1, int(msg.get("rows", 24)))
                    cols = max(1, int(msg.get("cols", 80)))
                    fcntl.ioctl(
                        master_fd, termios.TIOCSWINSZ,
                        struct.pack("HHHH", rows, cols, 0, 0),
                    )
            except (json.JSONDecodeError, TypeError, KeyError):
                os.write(master_fd, message.encode("utf-8", errors="replace"))
    except Exception:
        pass
    finally:
        stop.set()
        try:
            process.terminate()
        except Exception:
            pass
        try:
            os.close(master_fd)
        except Exception:
            pass
