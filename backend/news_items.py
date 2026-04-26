"""
Static news catalogue.

`news.html` currently hard-codes its cards. To surface the same headlines
in the new header notification dropdown we lift them into one source of
truth here. ``NEWS`` is sorted newest-first; each entry is JSON-friendly
so the route layer can hand them straight back to the client.

If/when an admin-managed news CRUD lands, this file becomes the seed
data and the notifications endpoint can be pointed at the database
instead of this list.
"""
from __future__ import annotations

from typing import List, Dict


NEWS: List[Dict[str, str]] = [
    {
        "id":      "kickoff-2026",
        "tag":     "Featured",
        "title":   "Cybersecurity Club Kicks Off New Semester",
        "summary": (
            "Hands-on workshops, live CTF activity, expert guest sessions, "
            "and a refreshed learning path designed to take members from "
            "complete beginners to competition-ready."
        ),
        "date":    "2026-04-20",
        "link":    "news.html",
    },
    {
        "id":      "linux-workshop",
        "tag":     "Workshop",
        "title":   "Linux Fundamentals Workshop Series",
        "summary": (
            "A new nine-module Linux course is now live on the Learning page, "
            "complete with an interactive terminal, a Docker capstone lab, "
            "and a UTB flag challenge."
        ),
        "date":    "2026-04-15",
        "link":    "learning.html",
    },
    {
        "id":      "campus-ctf-2026",
        "tag":     "Event",
        "title":   "Campus CTF 2026 Registration Opens",
        "summary": (
            "Teams can now register for Campus CTF 2026. Categories include "
            "Web, Crypto, Forensics, OSINT, and Reversing, with a live "
            "scoreboard during the event."
        ),
        "date":    "2026-04-10",
        "link":    "events.html",
    },
    {
        "id":      "dashboard-launch",
        "tag":     "Announcement",
        "title":   "Member Dashboard Launched",
        "summary": (
            "Active members now have a personal dashboard tracking completed "
            "tasks, earned XP, modules completed, and their position on the "
            "club leaderboard."
        ),
        "date":    "2026-04-05",
        "link":    "dashboard.html",
    },
    {
        "id":      "resources-refresh",
        "tag":     "Resources",
        "title":   "New Curated Learning Resources",
        "summary": (
            "Fresh batch of free, beginner-friendly resources added: "
            "TryHackMe, Hack The Box, PortSwigger Academy, picoCTF, "
            "OverTheWire, and more."
        ),
        "date":    "2026-03-28",
        "link":    "resources.html",
    },
    {
        "id":      "members-milestone",
        "tag":     "Milestone",
        "title":   "Club Membership Passes New Milestone",
        "summary": (
            "The Cybersecurity Club has welcomed a growing cohort of new "
            "members across Computer Science, Computer Engineering, IT, "
            "and Cybersecurity majors."
        ),
        "date":    "2026-03-20",
        "link":    "about.html",
    },
    {
        "id":      "semester-plan",
        "tag":     "Plan",
        "title":   "Semester Plan Published",
        "summary": (
            "The full semester plan is live: onboarding, Linux and "
            "networking workshops, web security, CTF prep, competition "
            "week, and a closing forensics session."
        ),
        "date":    "2026-03-12",
        "link":    "plan.html",
    },
]


def latest_news(limit: int = 3) -> List[Dict[str, str]]:
    """Return the ``limit`` most recent news entries (newest first).

    The list is already maintained in newest-first order; we still sort
    defensively so a future re-order of NEWS doesn't silently break the
    dropdown.
    """
    items = sorted(NEWS, key=lambda n: n.get("date", ""), reverse=True)
    return items[: max(0, limit)]
