"""
crypto_tasks.py
---------------
Authoritative scoring catalogue for the Cryptography course.

Each chapter (1..9) has four short lab tasks. When a student hits Enter in a
per-chapter terminal, the WebSocket handler calls ``score_line`` against that
chapter's task list; if a task's regex matches, XP is awarded exactly once.

The catalogue is mirrored on the front-end in ``assets/js/crypto-lab.js`` so
the offline simulator can still score commands when the backend is down.

Task IDs use the 3100..3999 block so they never collide with:
    Linux    1..34
    Network  101..904
    Web      1101..1904
    Ethics   2101..2904
"""
import re
from typing import Dict, List, Optional


# Every ``title`` is written for an absolute beginner: it tells the student in
# plain English what they are doing and suggests the exact command. The regex
# is deliberately forgiving so small variations of the suggested command still
# earn XP (lower/upper case, extra flags, different file names).
CRYPTO_TASKS: Dict[int, List[dict]] = {
    # =====================================================================
    1: [  # What is cryptography?
        {"id": 3101, "xp": 10,
         "title": "Read the welcome file \u2014 try: cat README.txt",
         "match": r"^(cat|less|more)\s+README(\.txt)?\b"},
        {"id": 3102, "xp": 10,
         "title": "Check your toolkit \u2014 try: openssl version",
         "match": r"^openssl\s+version\b"},
        {"id": 3103, "xp": 10,
         "title": "Encode a string with base64 (encoding, NOT encryption) \u2014 try: echo 'secret' | openssl base64",
         "match": r"\|\s*(openssl\s+base64|base64)(\s+|$)"},
        {"id": 3104, "xp": 10,
         "title": "Decode the base64 you just produced \u2014 try: echo 'c2VjcmV0' | openssl base64 -d",
         "match": r"\|\s*(openssl\s+base64|base64)\s+-d\b"},
    ],

    # =====================================================================
    2: [  # The first ciphers (substitution)
        {"id": 3201, "xp": 12,
         "title": "Encode HELLO with ROT13 \u2014 try: echo HELLO | tr 'A-Za-z' 'N-ZA-Mn-za-m'",
         "match": r"\btr\s+['\"]?[A-Za-z\-]+['\"]?\s+['\"]?N-ZA-M"},
        {"id": 3202, "xp": 12,
         "title": "Encode HELLO with a Caesar shift of 3 \u2014 try: echo HELLO | tr 'A-Za-z' 'D-ZA-Cd-za-c'",
         "match": r"\btr\s+['\"]?[A-Za-z\-]+['\"]?\s+['\"]?D-ZA-C"},
        {"id": 3203, "xp": 12,
         "title": "Encode HELLO with Atbash (reverse alphabet) \u2014 try: echo HELLO | tr 'A-Za-z' 'Z-Az-a'",
         "match": r"\btr\s+['\"]?[Aa]-[Zz][A-Za-z\-]*['\"]?\s+['\"]?Z-A"},
        {"id": 3204, "xp": 12,
         "title": "Frequency-count the letters of a ciphertext \u2014 try: cat ciphertext.txt | grep -o . | sort | uniq -c | sort -rn",
         "match": r"\bsort\b.*\buniq\s+-c\b|\buniq\s+-c\b.*\bsort\b"},
    ],

    # =====================================================================
    3: [  # A stronger substitution: Vigen\u00e8re
        {"id": 3301, "xp": 10,
         "title": "Read the Vigen\u00e8re notes \u2014 try: cat vigenere.md",
         "match": r"^(cat|less|more)\s+\S*vigenere(\.md|\.txt)?\b"},
        {"id": 3302, "xp": 15,
         "title": "Encrypt with Vigen\u00e8re \u2014 try: vig encrypt KEY HELLOWORLD",
         "match": r"\bvig\s+encrypt\s+\S+\s+\S+"},
        {"id": 3303, "xp": 15,
         "title": "Decrypt with Vigen\u00e8re \u2014 try: vig decrypt KEY RIJVSUYVJN",
         "match": r"\bvig\s+decrypt\s+\S+\s+\S+"},
        {"id": 3304, "xp": 10,
         "title": "Try a wrong key to see decryption fail \u2014 try: vig decrypt WRONG RIJVSUYVJN",
         "match": r"\bvig\s+(encrypt|decrypt)\s+\S+\s+\S+"},
    ],

    # =====================================================================
    4: [  # Symmetric encryption (one shared key)
        {"id": 3401, "xp": 15,
         "title": "Encrypt a file with AES-256 \u2014 try: openssl enc -aes-256-cbc -pbkdf2 -in plaintext.txt -out cipher.bin -k secret",
         "match": r"\bopenssl\s+enc\b.*-aes-(128|192|256)"},
        {"id": 3402, "xp": 15,
         "title": "Decrypt the file you just produced \u2014 try: openssl enc -aes-256-cbc -d -pbkdf2 -in cipher.bin -out recovered.txt -k secret",
         "match": r"\bopenssl\s+enc\b(?=.*-d\b)(?=.*-aes-(128|192|256))"},
        {"id": 3403, "xp": 10,
         "title": "View the ciphertext as hex \u2014 try: xxd cipher.bin | head",
         "match": r"\bxxd\b"},
        {"id": 3404, "xp": 10,
         "title": "Try the legacy DES cipher (just to see it run) \u2014 try: openssl enc -des-cbc -pbkdf2 -in plaintext.txt -out des.bin -k secret",
         "match": r"\bopenssl\s+enc\b.*-des(-cbc|-ecb)?\b"},
    ],

    # =====================================================================
    5: [  # Modes of operation
        {"id": 3501, "xp": 15,
         "title": "Encrypt with the BAD ECB mode (to see why it's bad) \u2014 try: openssl enc -aes-256-ecb -pbkdf2 -in plaintext.txt -out ecb.bin -k secret",
         "match": r"\bopenssl\s+enc\b.*-aes-(128|192|256)-ecb"},
        {"id": 3502, "xp": 15,
         "title": "Encrypt the same file with CBC \u2014 try: openssl enc -aes-256-cbc -pbkdf2 -in plaintext.txt -out cbc.bin -k secret",
         "match": r"\bopenssl\s+enc\b.*-aes-(128|192|256)-cbc"},
        {"id": 3503, "xp": 10,
         "title": "Compare the two outputs byte-by-byte \u2014 try: cmp ecb.bin cbc.bin || echo different",
         "match": r"\b(cmp|diff)\s+\S+\s+\S+"},
        {"id": 3504, "xp": 10,
         "title": "Read about modes \u2014 try: cat modes.md",
         "match": r"^(cat|less|more)\s+\S*modes(\.md|\.txt)?\b"},
    ],

    # =====================================================================
    6: [  # Hashing
        {"id": 3601, "xp": 10,
         "title": "Hash a string with the (broken!) MD5 \u2014 try: echo -n hello | openssl dgst -md5",
         "match": r"\bdgst\s+(-\w+\s+)*-md5\b|-md5\b.*\bdgst\b"},
        {"id": 3602, "xp": 15,
         "title": "Hash a string with modern SHA-256 \u2014 try: echo -n hello | openssl dgst -sha256",
         "match": r"\bdgst\s+(-\w+\s+)*-sha(256|384|512|3-256)\b|\b(sha256sum|shasum\s+-a\s+256)\b"},
        {"id": 3603, "xp": 10,
         "title": "Hash a whole file \u2014 try: openssl dgst -sha256 plaintext.txt",
         "match": r"\bopenssl\s+dgst\s+(-\w+\s+)*-sha(256|384|512)\s+\S+"},
        {"id": 3604, "xp": 15,
         "title": "Sign data with HMAC (hash + key) \u2014 try: echo -n data | openssl dgst -sha256 -hmac mysecretkey",
         "match": r"\bopenssl\s+dgst\b.*-hmac\s+\S+"},
    ],

    # =====================================================================
    7: [  # Asymmetric encryption (RSA)
        {"id": 3701, "xp": 15,
         "title": "Generate a 2048-bit RSA private key \u2014 try: openssl genrsa -out private.pem 2048",
         "match": r"\bopenssl\s+genrsa\b"},
        {"id": 3702, "xp": 15,
         "title": "Extract the matching public key \u2014 try: openssl rsa -in private.pem -pubout -out public.pem",
         "match": r"\bopenssl\s+rsa\b.*-pubout\b"},
        {"id": 3703, "xp": 15,
         "title": "Encrypt a message with the public key \u2014 try: openssl pkeyutl -encrypt -pubin -inkey public.pem -in plaintext.txt -out enc.bin",
         "match": r"\bopenssl\s+pkeyutl\b.*-encrypt\b"},
        {"id": 3704, "xp": 15,
         "title": "Decrypt with the private key \u2014 try: openssl pkeyutl -decrypt -inkey private.pem -in enc.bin -out decrypted.txt",
         "match": r"\bopenssl\s+pkeyutl\b.*-decrypt\b"},
    ],

    # =====================================================================
    8: [  # Digital signatures
        {"id": 3801, "xp": 15,
         "title": "Sign a file with your private key \u2014 try: openssl dgst -sha256 -sign private.pem -out sig.bin plaintext.txt",
         "match": r"\bopenssl\s+dgst\b.*-sign\b"},
        {"id": 3802, "xp": 15,
         "title": "Verify the signature with the public key \u2014 try: openssl dgst -sha256 -verify public.pem -signature sig.bin plaintext.txt",
         "match": r"\bopenssl\s+dgst\b.*-verify\b"},
        {"id": 3803, "xp": 15,
         "title": "Make a self-signed certificate \u2014 try: openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 30 -nodes -subj /CN=test",
         "match": r"\bopenssl\s+req\b.*-x509\b"},
        {"id": 3804, "xp": 10,
         "title": "Read the certificate you just made \u2014 try: openssl x509 -in cert.pem -text -noout",
         "match": r"\bopenssl\s+x509\b.*-(text|subject|issuer|fingerprint)"},
    ],

    # =====================================================================
    9: [  # Crypto in the wild
        {"id": 3901, "xp": 10,
         "title": "Inspect a real TLS certificate \u2014 try: openssl s_client -connect example.com:443",
         "match": r"\bopenssl\s+s_client\b.*-connect\s+\S+:\d+"},
        {"id": 3902, "xp": 10,
         "title": "Verify a downloaded file's checksum \u2014 try: sha256sum plaintext.txt",
         "match": r"\b(sha256sum|sha1sum|md5sum|shasum)\s+\S+"},
        {"id": 3903, "xp": 10,
         "title": "Confirm gpg is installed \u2014 try: gpg --version",
         "match": r"^gpg\s+(--version|--list-keys|--help)\b"},
        {"id": 3904, "xp": 10,
         "title": "Generate fresh random bytes the right way \u2014 try: openssl rand -hex 16",
         "match": r"\bopenssl\s+rand\b"},
    ],
}

# Pre-compile regexes once at import time.
_COMPILED = {
    chapter: [(re.compile(t["match"], re.IGNORECASE), t) for t in tasks]
    for chapter, tasks in CRYPTO_TASKS.items()
}


def score_line(chapter: int, line: str) -> Optional[dict]:
    """Return the first matching task for ``line`` in ``chapter``, or None."""
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
    return [t["id"] for tasks in CRYPTO_TASKS.values() for t in tasks]


def task_by_id(task_id: int) -> Optional[dict]:
    for tasks in CRYPTO_TASKS.values():
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
    """JSON-safe catalogue for the front-end (no regex leakage)."""
    out = []
    for chapter, tasks in CRYPTO_TASKS.items():
        out.append({
            "chapter": chapter,
            "tasks": [
                {"id": t["id"], "xp": t["xp"], "title": t["title"]}
                for t in tasks if not t.get("hidden")
            ],
        })
    return out


TOTAL_XP = sum(t["xp"] for tasks in CRYPTO_TASKS.values() for t in tasks)
MAX_TASK_ID = max(all_task_ids())
MIN_TASK_ID = min(all_task_ids())
