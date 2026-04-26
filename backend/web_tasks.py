"""
web_tasks.py
------------
Authoritative scoring catalogue for the Web & Application Fundamentals course.

Each chapter (1..9) has a small list of task dicts. When a student hits Enter
in a per-chapter terminal, the WebSocket handler calls `score_line` against
that chapter's task list and, if a task's regex matches, awards XP exactly
once by appending the task id to the member's `Progress.completed_tasks`.

The catalogue is mirrored on the front-end in assets/js/web-lab.js so the
offline simulator can still score without the backend. Keep the two in sync.

Task IDs use the 1100..1999 block so they never collide with the Linux course
(1..34) or the Network course (101..904). Each chapter occupies one hundred
ids: chapter 1 → 1101..1199, chapter 2 → 1201..1299, etc.
"""
import re
from typing import Dict, List, Optional

# Every `title` below is written for an absolute beginner: it tells the student
# in plain English WHAT they are doing, then suggests the exact command they
# can type. The regex stays separate and flexible so small variations of the
# suggested command still earn XP.
WEB_TASKS: Dict[int, List[dict]] = {
    # =====================================================================
    1: [  # Introduction to the Web
        {"id": 1101, "xp": 10,
         "title": "Read the welcome file — try: cat README.txt",
         "match": r"^(cat|less|more)\s+README(\.txt)?\b"},
        {"id": 1102, "xp": 10,
         "title": "Make your first web request — try: curl http://example.com",
         "match": r"^curl(\s+--?\w+)*\s+http://\S+"},
        {"id": 1103, "xp": 15,
         "title": "Look up a website's IP address — try: host example.com",
         "match": r"^(host|getent\s+hosts)\s+\S+"},
        {"id": 1104, "xp": 10,
         "title": "See which browser/agent your tool reports — try: curl -A 'Mozilla/5.0' http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-A|--user-agent)\s+\S+.*\s+https?://\S+"},
    ],
    # =====================================================================
    2: [  # Clients & Servers
        {"id": 1201, "xp": 15,
         "title": "Watch the full request and response — try: curl -v http://example.com",
         "match": r"^curl(\s+--?\w+)*\s+-v(\s+|$)"},
        {"id": 1202, "xp": 15,
         "title": "Send a POST request like a form would — try: curl -X POST http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+-X\s+POST(\s+|$)"},
        {"id": 1203, "xp": 10,
         "title": "Talk to a web server with raw TCP — try: nc example.com 80",
         "match": r"^(nc|ncat)(\s+-\w+)*\s+\S+\s+\d+"},
        {"id": 1204, "xp": 15,
         "title": "Run your own tiny web server — try: python3 -m http.server 8000",
         "match": r"^python3?\s+-m\s+http\.server(\s+\d+)?(\s+|$)"},
    ],
    # =====================================================================
    3: [  # HTTP vs HTTPS
        {"id": 1301, "xp": 10,
         "title": "Open a plain HTTP page — try: curl http://example.com",
         "match": r"^curl(\s+--?\w+)*\s+http://\S+"},
        {"id": 1302, "xp": 15,
         "title": "Open the same page over HTTPS — try: curl https://example.com",
         "match": r"^curl(\s+--?\w+)*\s+https://\S+"},
        {"id": 1303, "xp": 15,
         "title": "Peek inside a TLS handshake — try: openssl s_client -connect example.com:443",
         "match": r"^openssl\s+s_client(\s+-\w+(\s+\S+)?)*\s+-connect\s+\S+:\d+"},
        {"id": 1304, "xp": 10,
         "title": "Ask the server only for its headers — try: curl -I https://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-I|--head)(\s+|$).*https?://\S+"},
    ],
    # =====================================================================
    4: [  # DNS, Domains & Subdomains
        {"id": 1401, "xp": 15,
         "title": "Look up a domain's IP (A record) — try: dig example.com",
         "match": r"^dig(\s+[+-]\w+(=\S+)?)*\s+(?!.*\bMX\b)(?!.*\bNS\b)(?!.*\bTXT\b)\S+"},
        {"id": 1402, "xp": 15,
         "title": "Find a domain's mail servers (MX) — try: dig -t MX example.com",
         "match": r"^(dig\s+(-t\s+)?MX\s+\S+|nslookup\s+-type=MX\s+\S+|host\s+-t\s+MX\s+\S+)"},
        {"id": 1403, "xp": 15,
         "title": "Find a domain's nameservers (NS) — try: dig -t NS example.com",
         "match": r"^(dig\s+(-t\s+)?NS\s+\S+|nslookup\s+-type=NS\s+\S+|host\s+-t\s+NS\s+\S+)"},
        {"id": 1404, "xp": 10,
         "title": "Look up who registered a domain — try: whois example.com",
         "match": r"^whois\s+\S+"},
    ],
    # =====================================================================
    5: [  # URLs & Parameters
        {"id": 1501, "xp": 15,
         "title": "Send query-string parameters — try: curl 'http://example.com/?q=hello&lang=en'",
         "match": r"^curl(\s+--?\w+)*\s+['\"]?https?://[^\s'\"]*\?\S*=\S+"},
        {"id": 1502, "xp": 15,
         "title": "Submit form data with POST — try: curl --data 'name=ali&role=student' http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(--data|-d)\s+\S+.*https?://\S+"},
        {"id": 1503, "xp": 10,
         "title": "URL-encode a value safely — try: curl --data-urlencode 'q=hello world' http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+--data-urlencode\s+\S+"},
        {"id": 1504, "xp": 10,
         "title": "Hit a non-default port — try: curl http://example.com:8080/",
         "match": r"^curl(\s+--?\w+)*\s+https?://[^\s/]+:\d+\b"},
    ],
    # =====================================================================
    6: [  # Headers, Cookies & Sessions
        {"id": 1601, "xp": 15,
         "title": "List the response headers a server returns — try: curl -I https://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-I|--head)(\s+|$)"},
        {"id": 1602, "xp": 15,
         "title": "Send a custom header — try: curl -H 'X-Demo: 1' http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+-H\s+\S+.*https?://\S+"},
        {"id": 1603, "xp": 15,
         "title": "Send a cookie with your request — try: curl -b 'session=abc123' http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-b|--cookie)\s+\S+.*https?://\S+"},
        {"id": 1604, "xp": 10,
         "title": "Save the cookies a server sets — try: curl -c cookies.txt http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-c|--cookie-jar)\s+\S+.*https?://\S+"},
    ],
    # =====================================================================
    7: [  # Proxies & Caching
        {"id": 1701, "xp": 15,
         "title": "Send your traffic through a proxy — try: curl -x http://127.0.0.1:8080 http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-x|--proxy)\s+\S+.*https?://\S+"},
        {"id": 1702, "xp": 10,
         "title": "Bypass cached answers — try: curl -H 'Cache-Control: no-cache' http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+-H\s+['\"]?[Cc]ache-[Cc]ontrol:.*https?://\S+"},
        {"id": 1703, "xp": 15,
         "title": "Follow redirects automatically — try: curl -L http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-L|--location)(\s+|$).*https?://\S+"},
        {"id": 1704, "xp": 10,
         "title": "Run a tiny local web server to test your own proxy — try: python3 -m http.server 8080",
         "match": r"^python3?\s+-m\s+http\.server\s+8080(\s+|$)"},
    ],
    # =====================================================================
    8: [  # Web Application Architecture
        {"id": 1801, "xp": 15,
         "title": "Talk to a real REST API — try: curl https://api.github.com/users/octocat",
         "match": r"^curl(\s+--?\w+)*\s+https?://api\.[^\s]+"},
        {"id": 1802, "xp": 15,
         "title": "Ask for JSON specifically — try: curl -H 'Accept: application/json' https://api.github.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+-H\s+['\"]?[Aa]ccept:\s*application/json.*https?://\S+"},
        {"id": 1803, "xp": 10,
         "title": "Pretty-print a JSON response — try: curl https://api.github.com | jq .",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+https?://\S+.*\|\s*jq\b"},
        {"id": 1804, "xp": 15,
         "title": "Send a PUT request like an API client — try: curl -X PUT http://example.com/item/1",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+-X\s+PUT(\s+|$)"},
    ],
    # =====================================================================
    9: [  # The Developer Toolbox
        {"id": 1901, "xp": 15,
         "title": "Watch every step of a request happen — try: curl -v https://example.com",
         "match": r"^curl(\s+--?\w+)*\s+-v(\s+|$)"},
        {"id": 1902, "xp": 10,
         "title": "Save a page to a file — try: curl -o page.html http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-o|--output)\s+\S+.*https?://\S+"},
        {"id": 1903, "xp": 10,
         "title": "Show only the bits you care about — try: curl -s http://example.com | head",
         "match": r"^curl(\s+--?\w+)*\s+-s\b.*\|\s*(head|tail|grep|wc|less)\b"},
        {"id": 1904, "xp": 15,
         "title": "Time how slow a request is — try: curl -w '%{time_total}\\n' -o /dev/null -s http://example.com",
         "match": r"^curl(\s+--?\w+(\s+\S+)?)*\s+(-w|--write-out)\s+\S+.*https?://\S+"},
    ],
}

# Pre-compile regexes once at import time.
_COMPILED = {
    chapter: [(re.compile(t["match"], re.IGNORECASE), t) for t in tasks]
    for chapter, tasks in WEB_TASKS.items()
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
    return [t["id"] for tasks in WEB_TASKS.values() for t in tasks]


def task_by_id(task_id: int) -> Optional[dict]:
    for tasks in WEB_TASKS.values():
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
    ``hidden`` (none today, but kept for parity with the network catalogue)
    are excluded from the public listing.
    """
    out = []
    for chapter, tasks in WEB_TASKS.items():
        out.append({
            "chapter": chapter,
            "tasks": [
                {"id": t["id"], "xp": t["xp"], "title": t["title"]}
                for t in tasks if not t.get("hidden")
            ],
        })
    return out


TOTAL_XP = sum(t["xp"] for tasks in WEB_TASKS.values() for t in tasks)
MAX_TASK_ID = max(all_task_ids())
MIN_TASK_ID = min(all_task_ids())
