"""
H9 FIX: PII Scrubbing Service
==============================
Provides scrub_pii() and prepare_email_for_memory() to redact sensitive
identifiers before content is written to ChromaDB.

Redacted patterns:
  - Email addresses
  - Indian mobile numbers (10-digit, starting with 6-9, with optional +91/0 prefix)
  - 16-digit card numbers (with optional spaces or hyphens every 4 digits)
"""

import re

# ─── PII regex patterns ───────────────────────────────────────────────────────

_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)

# Indian mobile: optional +91 or 0 prefix, then 10 digits starting 6-9
_MOBILE_RE = re.compile(
    r"(?:(?:\+91|0)\s?)?[6-9]\d{9}"
)

# 16-digit card: groups of 4 separated by optional space/hyphen
_CARD_RE = re.compile(
    r"\b(?:\d{4}[\s\-]?){3}\d{4}\b"
)

_REDACTED = "[REDACTED]"

# ─── Public API ───────────────────────────────────────────────────────────────

def scrub_pii(text: str) -> str:
    """
    Redact email addresses, Indian mobile numbers, and 16-digit card numbers
    from *text* and return the sanitised string.

    Order matters: card numbers are matched before mobiles to avoid
    partial matches on the first 10 digits of a 16-digit number.
    """
    text = _CARD_RE.sub(_REDACTED, text)
    text = _MOBILE_RE.sub(_REDACTED, text)
    text = _EMAIL_RE.sub(_REDACTED, text)
    return text


def prepare_email_for_memory(body: str) -> str:
    """
    H9 FIX: Prepare a raw email body for safe storage in ChromaDB:
      1. Truncate to 800 characters (limits token exposure and storage cost).
      2. Scrub PII patterns.

    Use this instead of passing raw email body directly to store_memory().
    """
    truncated = body[:800]
    return scrub_pii(truncated)
