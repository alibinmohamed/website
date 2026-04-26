"""
network_tasks.py
----------------
Authoritative scoring catalogue for the Network Fundamentals course.

Each chapter (1..9) has a small list of task dicts. When a student hits Enter
in a per-chapter terminal, the WebSocket handler calls `score_line` against
that chapter's task list and, if a task's regex matches, awards XP exactly
once by appending the task id to the member's `Progress.completed_tasks`.

The catalogue is mirrored on the front-end in assets/js/network-lab.js so the
offline simulator can still score without the backend. Keep the two in sync.
"""
import re
from typing import Dict, List, Optional

# Task IDs are assigned in blocks of 100 per chapter so they never collide
# with the Linux course's 1..34 id range.
# Every `title` below is written for a complete beginner: it tells the student
# in plain English WHAT they are doing, and then suggests the exact command
# they can type. The regex stays separate and flexible so the student can use
# small variations of the suggested command and still earn XP.
NETWORK_TASKS: Dict[int, List[dict]] = {
    # =====================================================================
    1: [  # Introduction
        {"id": 101, "xp": 10,
         "title": "Check if the Internet is reachable — try: ping 1.1.1.1",
         "match": r"^ping(\s+-[a-zA-Z0-9]+(\s+\S+)?)*\s+(1\.1\.1\.1|8\.8\.8\.8|9\.9\.9\.9)\b"},
        {"id": 102, "xp": 10,
         "title": "Check a website by name — try: ping example.com",
         "match": r"^ping(\s+-[a-zA-Z0-9]+(\s+\S+)?)*\s+[a-z0-9][a-z0-9.-]*\.(com|bh|net|org|edu)\b"},
        {"id": 103, "xp": 10,
         "title": "Find your own IP address — try: ip a",
         "match": r"^(ifconfig(\s+-a)?|ip\s+(-\w+\s+)?a(ddr)?\b)"},
        {"id": 104, "xp": 10,
         "title": "Read the welcome file — try: cat README.txt",
         "match": r"^(cat|less|more)\s+README(\.txt)?\b"},
    ],
    # =====================================================================
    2: [  # OSI Model
        {"id": 201, "xp": 15,
         "title": "Watch a web request happen step by step — try: curl -v http://example.com",
         "match": r"^curl(\s+--?\w+)*\s+-v(\s+|$)"},
        {"id": 202, "xp": 15,
         "title": "See every hop your traffic passes through — try: traceroute example.com",
         "match": r"^(traceroute|tracepath|mtr)(\s+-\w+)*\s+\S+"},
        {"id": 203, "xp": 10,
         "title": "Peek at raw network packets — try: tcpdump",
         "match": r"^(sudo\s+)?tcpdump(\s+-[a-zA-Z0-9]+)*(\s+\S+)*$"},
        {"id": 204, "xp": 10,
         "title": "See the hardware addresses of nearby devices — try: arp -a",
         "match": r"^(arp\s+-a\b|ip\s+neigh(bour)?\b)"},
    ],
    # =====================================================================
    3: [  # IP Addresses
        {"id": 301, "xp": 10,
         "title": "Find your IPv4 address — try: ip a",
         "match": r"^ip\s+(-4\s+)?a(ddr)?\b"},
        {"id": 302, "xp": 10,
         "title": "Find your IPv6 address — try: ip -6 a",
         "match": r"^ip\s+-6\s+a(ddr)?\b"},
        {"id": 303, "xp": 15,
         "title": "Calculate a subnet range — try: ipcalc 192.168.1.0/24",
         "match": r"^ipcalc\s+\S+/\d+\b|^ipcalc\s+\S+\s+\S+"},
        {"id": 304, "xp": 10,
         "title": "Ping your own computer (loopback test) — try: ping 127.0.0.1",
         "match": r"^ping6?(\s+-[a-zA-Z0-9]+(\s+\S+)?)*\s+(127\.0\.0\.1|::1)\b"},
    ],
    # =====================================================================
    4: [  # Ports
        {"id": 401, "xp": 15,
         "title": "See which ports are open on your machine — try: ss -tulpn",
         "match": r"^(ss\s+-[a-zA-Z]*[lt][a-zA-Z]*|netstat\s+-[a-zA-Z]*l[a-zA-Z]*)"},
        {"id": 402, "xp": 15,
         "title": "Check if a port on a server is open — try: nc -zv example.com 80",
         "match": r"^(nc|ncat)\s+-\w*z\w*\w*\s+\S+\s+\d+"},
        {"id": 403, "xp": 10,
         "title": "Ask a web server for just its headers — try: curl -I example.com",
         "match": r"^curl(\s+--?\w+)*\s+(-I|--head)(\s+|$)"},
        {"id": 404, "xp": 10,
         "title": "Open an encrypted (TLS) connection — try: openssl s_client -connect example.com:443",
         "match": r"^openssl\s+s_client(\s+-\w+(\s+\S+)?)*\s+-connect\s+\S+:\d+"},
    ],
    # =====================================================================
    5: [  # Service Types
        {"id": 501, "xp": 15,
         "title": "Look up a domain name (DNS uses UDP) — try: dig example.com",
         "match": r"^dig(\s+[+-]\w+(=\S+)?)*\s+\S+"},
        {"id": 502, "xp": 15,
         "title": "Download a web page (HTTP uses TCP) — try: curl https://example.com",
         "match": r"^curl(\s+--?\w+)*\s+https?://\S+"},
        {"id": 503, "xp": 10,
         "title": "See your computer's routing table — try: ip route",
         "match": r"^ip\s+(-\w+\s+)?r(oute)?\b"},
        {"id": 504, "xp": 10,
         "title": "See nearby devices (ARP cache) — try: arp -a",
         "match": r"^(arp\s+-a\b|ip\s+neigh(bour)?\b)"},
    ],
    # =====================================================================
    6: [  # Topology
        {"id": 601, "xp": 15,
         "title": "See the path to a public server — try: traceroute 1.1.1.1",
         "match": r"^(traceroute|tracepath)(\s+-\w+)*\s+\S+"},
        {"id": 602, "xp": 10,
         "title": "Show your routing table — try: ip route",
         "match": r"^ip\s+(-\w+\s+)?r(oute)?\b"},
        {"id": 603, "xp": 10,
         "title": "Find a nearby device's hardware (MAC) address — try: arp -a",
         "match": r"^(arp\s+-a\b|ip\s+neigh(bour)?\b)"},
        {"id": 604, "xp": 15,
         "title": "Run a live network path report — try: mtr example.com",
         "match": r"^mtr(\s+-\w+)*\s+\S+"},
        # Topology-widget objectives. These are awarded by the UI (the
        # in-browser star-network builder), not by typed commands, so the
        # regex below intentionally never matches anything the student
        # types. They are flagged `hidden=True` so the public catalogue
        # excludes them from the per-chapter task panel — they would
        # otherwise appear twice on the page (once in the topology widget
        # at the top of the lab, and again in the chapter-6 checklist).
        # Their XP still rolls up into the course-wide XP bar.
        {"id": 605, "xp": 5,  "hidden": True,
         "title": "Topology: inspect any device to read its role",
         "match": r"a^"},
        {"id": 606, "xp": 10, "hidden": True,
         "title": "Topology: send a successful LAN ping (PC1 → PC2)",
         "match": r"a^"},
        {"id": 607, "xp": 10, "hidden": True,
         "title": "Topology: send a successful Internet ping (PC1 → Internet)",
         "match": r"a^"},
        {"id": 608, "xp": 10, "hidden": True,
         "title": "Topology: observe a ping fail when a cable is broken",
         "match": r"a^"},
        {"id": 609, "xp": 5,  "hidden": True,
         "title": "Topology: restore the cables and recover connectivity",
         "match": r"a^"},
        {"id": 610, "xp": 10, "hidden": True,
         "title": "Topology: identify the number of broadcast domains",
         "match": r"a^"},
    ],
    # =====================================================================
    7: [  # Application Protocols
        {"id": 701, "xp": 10,
         "title": "Visit a plain HTTP website — try: curl http://example.com",
         "match": r"^curl(\s+--?\w+)*\s+http://\S+"},
        {"id": 702, "xp": 15,
         "title": "Visit a secure HTTPS website — try: curl https://example.com",
         "match": r"^curl(\s+--?\w+)*\s+https://\S+"},
        {"id": 703, "xp": 15,
         "title": "Find a domain's mail servers — try: dig -t MX example.com",
         "match": r"^(dig\s+(-t\s+)?MX\s+\S+|nslookup\s+-type=MX\s+\S+|host\s+-t\s+MX\s+\S+)"},
        {"id": 704, "xp": 10,
         "title": "Look up who owns a domain — try: whois example.com",
         "match": r"^whois\s+\S+"},
    ],
    # =====================================================================
    8: [  # Command Lines
        {"id": 801, "xp": 10,
         "title": "Show your IP address — try: ip a",
         "match": r"^ip\s+(-\w+\s+)?a(ddr)?\b"},
        {"id": 802, "xp": 10,
         "title": "Show how your traffic is routed — try: ip route",
         "match": r"^ip\s+(-\w+\s+)?r(oute)?\b"},
        {"id": 803, "xp": 10,
         "title": "List listening ports on your machine — try: ss -tulpn",
         "match": r"^ss\s+-[a-zA-Z]*[lt][a-zA-Z]*"},
        {"id": 804, "xp": 10,
         "title": "Look up a domain name — try: nslookup example.com",
         "match": r"^(nslookup|dig|host)\s+\S+"},
        {"id": 805, "xp": 10,
         "title": "Ask a web server for just headers — try: curl -I example.com",
         "match": r"^curl(\s+--?\w+)*\s+(-I|--head)(\s+|$)"},
    ],
    # =====================================================================
    9: [  # Synchronization
        {"id": 901, "xp": 10,
         "title": "Show the current date and time — try: date",
         "match": r"^date(\s+.*)?$"},
        {"id": 902, "xp": 15,
         "title": "See which time servers your machine uses — try: ntpq -p",
         "match": r"^ntpq\s+-p\b"},
        {"id": 903, "xp": 15,
         "title": "Ask a public time server what time it is — try: ntpdate -q pool.ntp.org",
         "match": r"^(ntpdate\s+-q\s+\S+|sntp\s+(-\w+\s+)*\S+)"},
        {"id": 904, "xp": 10,
         "title": "Watch a secure connection be set up — try: curl -v https://example.com",
         "match": r"^curl(\s+--?\w+)*\s+-v(\s+|$)"},
    ],
}

# Pre-compile regexes once at import time.
_COMPILED = {
    chapter: [(re.compile(t["match"], re.IGNORECASE), t) for t in tasks]
    for chapter, tasks in NETWORK_TASKS.items()
}


def score_line(chapter: int, line: str) -> Optional[dict]:
    """
    Return the first matching task dict for ``line`` in ``chapter``,
    or ``None`` if the line doesn't complete any task.
    """
    if not line:
        return None
    line = line.strip()
    if not line:
        return None
    compiled = _COMPILED.get(int(chapter))
    if not compiled:
        return None
    for pattern, task in compiled:
        if pattern.search(line):
            return task
    return None


def all_task_ids() -> List[int]:
    return [t["id"] for tasks in NETWORK_TASKS.values() for t in tasks]


def task_by_id(task_id: int) -> Optional[dict]:
    for tasks in NETWORK_TASKS.values():
        for t in tasks:
            if t["id"] == task_id:
                return t
    return None


def xp_for(task_ids) -> int:
    total = 0
    for tid in task_ids or []:
        try:
            t = task_by_id(int(tid))
        except (TypeError, ValueError):
            continue
        if t:
            total += int(t.get("xp", 0))
    return total


def public_catalogue() -> list:
    """
    A JSON-serialisable view of the catalogue for the front-end / REST API.
    The regex is omitted so we don't leak the matching rules. Tasks marked
    ``hidden`` are owned by a dedicated UI widget (e.g. the chapter-6
    topology builder) and are excluded so REST consumers don't render the
    same task twice on the same page.
    """
    out = []
    for chapter, tasks in NETWORK_TASKS.items():
        out.append({
            "chapter": chapter,
            "tasks": [
                {"id": t["id"], "xp": t["xp"], "title": t["title"]}
                for t in tasks if not t.get("hidden")
            ],
        })
    return out


TOTAL_XP = sum(t["xp"] for tasks in NETWORK_TASKS.values() for t in tasks)
MAX_TASK_ID = max(all_task_ids())
MIN_TASK_ID = min(all_task_ids())
