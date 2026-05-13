"""
Twin Chat Orchestration Service
================================
Handles AI-Twin logic for Twin-to-Twin Direct Chat:
  • Memory retrieval from ChromaDB
  • Message enrichment & summarization
  • Suggested reply generation
  • Twin identity persona
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from graph.llm_utils import _llm
from memory.chroma import retrieve_memory, store_memory
from db.models import User

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────
# Memory retrieval
# ────────────────────────────────────────────────────────────────────

def fetch_twin_context(user_id: str, query: str, n: int = 4) -> str:
    """Fetch relevant memory from ChromaDB for a given query."""
    try:
        ctx = retrieve_memory(user_id=user_id, query=query, n=n)
        return ctx.strip() if ctx else ""
    except Exception as e:
        logger.warning(f"[TwinChat] Memory retrieval failed for {user_id}: {e}")
        return ""


# ────────────────────────────────────────────────────────────────────
# Core pipeline
# ────────────────────────────────────────────────────────────────────

def generate_twin_enrichment(
    user: User,
    incoming_message: str,
    conversation_history: list[dict],
    partner_name: str,
    partner_id: str,
) -> dict:
    """
    Full Twin pipeline for a received message:
    1. Retrieves sender & receiver context from memory
    2. Produces an enriched summary / insight for the receiver
    3. Generates 2–3 suggested reply drafts
    4. Returns structured result dict
    """
    user_id = user.id
    user_name = user.name or "You"

    # ── 1. Memory retrieval ──────────────────────────────────────────
    receiver_ctx = fetch_twin_context(user_id, incoming_message)
    sender_ctx   = fetch_twin_context(partner_id, incoming_message)

    # ── 2. Build conversation string ─────────────────────────────────
    history_str = ""
    for msg in conversation_history[-10:]:  # last 10 messages for context
        role = "You" if msg.get("sender_id") == user_id else partner_name
        history_str += f"{role}: {msg.get('content', '')}\n"

    # ── 3. System prompt ─────────────────────────────────────────────
    system_prompt = f"""You are the AI Twin of {user_name}. Your job is to:
1. Understand what {partner_name} just said to {user_name}.
2. Retrieve relevant context from {user_name}'s memory.
3. Draft 2-3 natural, helpful suggested replies that {user_name} can send.

INTEGRATIONS & ACTIONS:
You have access to Calendar, Gmail, and Slack. 
If the message implies an action (e.g., "let's meet", "send me that email", "post this to slack"):
- Include an <action> block at the end of the "content" field for the relevant suggestion.
- For meetings, suggest a specific slot (default to today if just a time is given).
- For emails, draft the full body.

RULES:
- DO NOT just parrot or repeat what {partner_name} said.
- Replies must sound like {user_name} (first-person, natural tone).
- If suggesting an action, be proactive but concise. NEVER say "I have already sent this" or "I have scheduled it". You are drafting a PROPOSAL. Say "I will send this" or "Here is the drafted email".
- Never fabricate facts or fake execution results. Only use provided context.
- Keep suggestions concise and actionable.

Return ONLY valid JSON in this exact format:
{{
  "enrichment": "Brief AI insight about this message (1-2 sentences)",
  "suggestions": [
    {{"label": "Quick reply", "content": "..."}},
    {{"label": "Action: Schedule", "content": "I've drafted a meeting invite for today at 9 PM.\\n\\n<action>...JSON_HERE...</action>"}},
    {{"label": "Clarifying question", "content": "..."}}
  ]
}}

ACTION BLOCK FORMATS:
- Calendar: <action>{{"intent": "calendar", "title": "...", "start_datetime": "ISO_STRING", "end_datetime": "ISO_STRING", "attendees": ["email@example.com"], "description": "..."}}</action>
- Email: <action>{{"intent": "email", "to": "...", "subject": "...", "body": "..."}}</action>
- Slack: <action>{{"intent": "slack", "channel_id": "...", "channel_name": "...", "text": "..."}}</action>
"""

    user_prompt = f"""INCOMING MESSAGE from {partner_name}:
"{incoming_message}"

RECENT CONVERSATION:
{history_str if history_str else "(No prior messages)"}

{user_name}'s MEMORY CONTEXT:
{receiver_ctx if receiver_ctx else "(No relevant memories found)"}

{partner_name}'s KNOWN CONTEXT:
{sender_ctx if sender_ctx else "(No relevant context)"}

Generate the enrichment and suggested replies now."""

    # ── 4. Call LLM ──────────────────────────────────────────────────
    try:
        raw = _llm(system=system_prompt, user=user_prompt, intent="other", force_fast=True)
        # Strip markdown fences if present
        cleaned = raw.strip()
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0].strip()
        elif "```" in cleaned:
            cleaned = cleaned.split("```")[1].split("```")[0].strip()

        result = json.loads(cleaned)
        return {
            "enrichment": result.get("enrichment", ""),
            "suggestions": result.get("suggestions", []),
        }
    except Exception as e:
        logger.error(f"[TwinChat] Enrichment LLM failed: {e}")
        return {
            "enrichment": "",
            "suggestions": [],
        }


def generate_twin_suggestion_only(
    user: User,
    user_draft: str,
    conversation_history: list[dict],
    partner_name: str,
) -> str:
    """
    When user is composing a message, Twin can enhance/polish it.
    Returns a single improved version of the draft.
    """
    user_name = user.name or "You"
    history_str = ""
    for msg in conversation_history[-6:]:
        role = "You" if msg.get("sender_id") == user.id else partner_name
        history_str += f"{role}: {msg.get('content', '')}\n"

    ctx = fetch_twin_context(user.id, user_draft)

    system = f"""You are the AI Twin of {user_name}. The user is drafting a message to {partner_name}.
Improve the draft to be clearer, warmer, and more effective. Preserve the user's intent.
Return ONLY the improved message text, nothing else."""

    user_msg = f"""DRAFT:
"{user_draft}"

CONVERSATION CONTEXT:
{history_str if history_str else "(No prior messages)"}

MEMORY:
{ctx if ctx else "(None)"}"""

    try:
        return _llm(system=system, user=user_msg, intent="other").strip()
    except Exception as e:
        logger.error(f"[TwinChat] Draft polish failed: {e}")
        return user_draft


def summarize_conversation(
    user_id: str,
    session_id: str,
    messages: list[dict],
) -> str:
    """Produce a concise summary of the conversation for memory indexing."""
    if not messages:
        return ""

    convo = "\n".join([
        f"{m.get('sender_name', 'User')}: {m.get('content', '')}"
        for m in messages
    ])

    system = """You are an AI summarizer. Summarize the following conversation in 2-4 sentences.
Focus on key decisions, topics discussed, and any commitments made.
Return ONLY the summary text."""

    try:
        summary = _llm(system=system, user=convo, force_fast=True).strip()
        # Store summary in memory
        store_memory(
            user_id=user_id,
            doc_id=f"twin_chat_{session_id}",
            content=summary,
            type="twin_chat",
            metadata={
                "session_id": session_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        return summary
    except Exception as e:
        logger.error(f"[TwinChat] Summarization failed: {e}")
        return ""


def store_message_in_memory(
    user_id: str,
    session_id: str,
    message_id: str,
    content: str,
    sender_name: str,
    partner_name: str,
    is_outgoing: bool,
):
    """Index a sent/received message into ChromaDB for future memory retrieval."""
    try:
        direction = "sent to" if is_outgoing else "received from"
        store_memory(
            user_id=user_id,
            doc_id=f"twin_chat_msg_{message_id}",
            content=f"[Twin Chat] Message {direction} {partner_name if is_outgoing else sender_name}: {content}",
            type="twin_chat",
            metadata={
                "session_id": session_id,
                "direction": "outgoing" if is_outgoing else "incoming",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as e:
        logger.warning(f"[TwinChat] Memory store failed: {e}")
