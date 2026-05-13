import os
import json
import re
from typing import List, Optional

from groq import Groq
from sqlalchemy.orm import Session

from db.models import StructuredMemory
from memory.chroma import store_memory
from core.config import settings


MODEL = settings.LEARNING_MODEL or "llama-3.1-8b-instant"


def _safe_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return {}
    return {}


def _get_client() -> Optional[Groq]:
    key = settings.GROQ_API_KEY
    if not key:
        return None
    return Groq(api_key=key)


def _extract_structured_memories(client: Groq, payload: dict) -> List[dict]:
    """
    Returns a list of memories:
      [{category,key,value,confidence,source}]
    """
    system = """
You extract durable, user-specific structured memories for a personal assistant.

Only extract facts that are:
- stable over time (preferences, habits, recurring tasks, style)
- clearly attributable to the user

Do NOT extract:
- secrets, passwords, tokens
- one-off ephemeral details
- sensitive PII not needed for assistance

Output ONLY valid JSON:
{
  "memories": [
    {
      "category": "preference|habit|task|style|other",
      "key": "snake_case_dedupe_key",
      "value": "short human readable memory",
      "confidence": 0.0,
      "source": "chat|email|calendar"
    }
  ]
}
""".strip()

    user = json.dumps(payload, ensure_ascii=False)
    resp = client.chat.completions.create(
        model=MODEL,
        temperature=0,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    text = (resp.choices[0].message.content or "").strip()
    parsed = _safe_json(text)
    memories = parsed.get("memories", [])
    if not isinstance(memories, list):
        return []
    cleaned = []
    for m in memories[:10]:
        if not isinstance(m, dict):
            continue
        category = (m.get("category") or "").strip()
        key = (m.get("key") or "").strip()
        value = (m.get("value") or "").strip()
        if not category or not key or not value:
            continue
        cleaned.append(
            {
                "category": category[:32],
                "key": key[:128],
                "value": value[:500],
                "confidence": m.get("confidence", None),
                "source": (m.get("source") or "chat")[:32],
            }
        )
    return cleaned


def learn_from_interaction(
    db: Session,
    user_id: str,
    user_input: str,
    assistant_output: str,
    intent: str,
    chat_history: List[dict],
) -> None:
    """
    Best-effort: extracts structured memories and stores:
    - in SQL (upsert by user_id+category+key)
    - in Chroma (for semantic retrieval) with metadata user_id/category/key
    """
    client = _get_client()
    if not client:
        return

    payload = {
        "user_id": user_id,
        "intent": intent,
        "user_input": user_input,
        "assistant_output": assistant_output,
        "recent_chat_history": chat_history[-10:],
    }

    memories = _extract_structured_memories(client, payload)
    if not memories:
        return

    for m in memories:
        row = (
            db.query(StructuredMemory)
            .filter(
                StructuredMemory.user_id == user_id,
                StructuredMemory.category == m["category"],
                StructuredMemory.key == m["key"],
            )
            .first()
        )
        if not row:
            row = StructuredMemory(user_id=user_id, category=m["category"], key=m["key"], value=m["value"])
        else:
            row.value = m["value"]
        row.source = m.get("source")
        row.confidence = str(m.get("confidence")) if m.get("confidence") is not None else row.confidence
        db.add(row)
        db.commit()

        # Also store in vector memory for retrieval injection
        store_memory(
            user_id=user_id,
            doc_id=f"sm_{m['category']}_{m['key']}",
            content=f"{m['category']}: {m['value']}",
            type="structured",
            metadata={"category": m["category"], "key": m["key"]},
        )


def get_structured_memories_text(db: Session, user_id: str, limit: int = 12) -> str:
    rows = (
        db.query(StructuredMemory)
        .filter(StructuredMemory.user_id == user_id)
        .order_by(StructuredMemory.updated_at.desc())
        .limit(limit)
        .all()
    )
    if not rows:
        return ""
    lines = [f"- {r.category}: {r.value}" for r in rows]
    return "\n".join(lines)

