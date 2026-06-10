"""Normalize spoken punctuation into real symbols for voice transcripts."""

import re

_AT_PATTERNS = [
    re.compile(r"\bat\s*the\s*rate\b", re.I),
    re.compile(r"\battherate\b", re.I),
    re.compile(r"\bat\s*sign\b", re.I),
    re.compile(r"\bat\s*symbol\b", re.I),
]

_TLD = re.compile(r"\b(com|org|net|io|co|in|edu|gov|uk|au|ca|me|dev|ai)\b", re.I)
_PROVIDER = re.compile(r"\b(gmail|yahoo|outlook|hotmail|icloud|protonmail|company)\b", re.I)
_LONE_AT = re.compile(r"(\w[\w.\-]*)\s+at\s+(\w[\w.\-]*)", re.I)


def _should_normalize_dots(text: str) -> bool:
    if "@" in text:
        return True
    if len(re.findall(r"\bdot\b", text, re.I)) >= 2:
        return True
    if re.search(r"\b\w+\s+dot\s+(com|org|net|io|co|in|edu|gov)\b", text, re.I):
        return True
    if re.search(r"\bat\s+(gmail|yahoo|outlook|hotmail|company)\b", text, re.I):
        return True
    return False


def normalize_spoken_symbols(text: str) -> str:
    """e.g. 'ronit at gmail dot com' → 'ronit@gmail.com'"""
    if not text:
        return text

    t = text.strip()

    for pat in _AT_PATTERNS:
        t = pat.sub("@", t)

    def _lone_at(m: re.Match) -> str:
        before, after = m.group(1), m.group(2)
        if _PROVIDER.search(after) or _TLD.search(after) or "." in before:
            return f"{before}@{after}"
        return m.group(0)

    t = _LONE_AT.sub(_lone_at, t)

    if _should_normalize_dots(t):
        t = re.sub(r"\s+dot\s+", ".", t, flags=re.I)
        t = re.sub(r"\bdot\b(?=\s*[\w])", ".", t, flags=re.I)

    if _should_normalize_dots(t) and re.search(r"\bperiod\b", t, re.I):
        t = re.sub(r"\s+period\s+", ".", t, flags=re.I)

    t = re.sub(r"\s*@\s*", "@", t)
    t = re.sub(r"\s*\.\s*", ".", t)

    t = re.sub(r"\s+underscore\s+", "_", t, flags=re.I)
    t = re.sub(r"\s+hyphen\s+", "-", t, flags=re.I)
    t = re.sub(r"\s+dash\s+", "-", t, flags=re.I)
    t = re.sub(r"\s+slash\s+", "/", t, flags=re.I)
    t = re.sub(r"(\d)\s+dot\s+(\d)", r"\1.\2", t, flags=re.I)

    t = re.sub(r"\s{2,}", " ", t).strip()
    return t
