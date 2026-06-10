"""Resolve contact names to emails from calendar history, Gmail, and memory."""

import logging
import re
from email.utils import parseaddr
from typing import Optional

from sqlalchemy.orm import Session

from db.models import StructuredMemory, User

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def _name_score(query: str, name: str, email: str) -> float:
    q = query.lower().strip()
    if not q or not email:
        return 0.0

    name_l = (name or "").lower().strip()
    local = email.lower().split("@")[0]
    q_parts = [p for p in q.split() if len(p) > 1]

    if name_l and (q == name_l or name_l == q):
        return 1.0
    if name_l and all(p in name_l for p in q_parts):
        return 0.92
    if all(p in local.replace(".", " ").replace("_", " ") for p in q_parts):
        return 0.78
    if q_parts and q_parts[0] in name_l.split():
        return 0.7
    return 0.0


def _add_contact(bucket: dict, email: str, name: str, source: str, score: float) -> None:
    email = (email or "").strip().lower()
    if not email or not EMAIL_RE.match(email):
        return
    key = email
    if key not in bucket:
        bucket[key] = {"email": email, "name": name or email.split("@")[0], "sources": [], "score": 0.0}
    if source not in bucket[key]["sources"]:
        bucket[key]["sources"].append(source)
    bucket[key]["score"] = max(bucket[key]["score"], score)
    if name and len(name) > len(bucket[key].get("name", "")):
        bucket[key]["name"] = name


def _parse_address_field(raw: str, bucket: dict, source: str, query: str) -> None:
    if not raw:
        return
    for part in re.split(r",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", raw):
        name, addr = parseaddr(part.strip())
        if addr:
            score = _name_score(query, name, addr)
            if score >= 0.65:
                _add_contact(bucket, addr, name, source, score)


def resolve_contacts_by_name(db: Session, user_id: str, name: str, limit: int = 5) -> list[dict]:
    """Find email addresses matching a person name from recent activity."""
    if not name or "@" in name:
        return []

    bucket: dict = {}
    query = name.strip()

    # ── Calendar attendees (recent meetings) ──────────────────
    try:
        from tools.calendar_tool import get_calendar_range

        events = get_calendar_range(db=db, user_id=user_id, days_past=90, days_future=30, max_results=80)
        for event in events:
            meeting = event.get("summary", "Meeting")
            for email in event.get("attendees", []):
                local_name = email.split("@")[0].replace(".", " ").replace("_", " ")
                score = _name_score(query, local_name, email)
                if score >= 0.65:
                    _add_contact(bucket, email, query.title(), f"meeting: {meeting}", score)
    except Exception as e:
        logger.warning("Contact resolve calendar failed: %s", e)

    # ── Gmail inbox + sent ────────────────────────────────────
    try:
        from tools.gmail_tool import read_recent_emails, get_gmail_service

        for row in read_recent_emails(db=db, user_id=user_id, max_results=30):
            _parse_address_field(row.get("from", ""), bucket, "recent email", query)

        service = get_gmail_service(db=db, user_id=user_id)
        sent = service.users().messages().list(userId="me", maxResults=25, labelIds=["SENT"]).execute()
        for msg in sent.get("messages", []):
            try:
                full = service.users().messages().get(userId="me", id=msg["id"], format="metadata",
                    metadataHeaders=["To", "Cc"]).execute()
                headers = full.get("payload", {}).get("headers", [])
                for h in headers:
                    if h.get("name", "").lower() in ("to", "cc"):
                        _parse_address_field(h.get("value", ""), bucket, "sent email", query)
            except Exception:
                continue
    except Exception as e:
        logger.warning("Contact resolve gmail failed: %s", e)

    # ── Structured memory contacts ────────────────────────────
    try:
        rows = (
            db.query(StructuredMemory)
            .filter(StructuredMemory.user_id == user_id)
            .filter(StructuredMemory.category.in_(["contact", "contacts", "people"]))
            .all()
        )
        for row in rows:
            val = row.value or ""
            if "@" in val:
                em_name, em_addr = parseaddr(val)
                if not em_addr and EMAIL_RE.match(val.strip()):
                    em_addr = val.strip()
                score = _name_score(query, em_name or row.key, em_addr)
                if score >= 0.65:
                    _add_contact(bucket, em_addr, em_name or row.key, "saved contact", score)
            elif query.lower() in (row.key or "").lower():
                if "@" in val:
                    _add_contact(bucket, val.strip(), row.key, "saved contact", 0.85)
    except Exception as e:
        logger.warning("Contact resolve memory failed: %s", e)

    # Exclude user's own email
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.email:
            bucket.pop(user.email.lower(), None)
    except Exception:
        pass

    ranked = sorted(bucket.values(), key=lambda x: x["score"], reverse=True)
    results = []
    for i, item in enumerate(ranked[:limit]):
        source = item["sources"][0] if item["sources"] else "history"
        results.append({
            "index": i + 1,
            "email": item["email"],
            "name": item["name"],
            "source": source,
            "score": round(item["score"], 2),
        })
    return results


def build_contact_pick_prompt(name: str, options: list[dict]) -> str:
    parts = [f"I found {len(options)} contacts for {name}."]
    for opt in options:
        src = opt.get("source", "history").replace("meeting: ", "meeting ")
        parts.append(f"Option {opt['index']}: {opt['email']} from {src}.")
    parts.append('Say "first one", "second one", or tap a button to choose.')
    return " ".join(parts)
