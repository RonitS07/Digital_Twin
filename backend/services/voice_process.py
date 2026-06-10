"""Voice-mode intent classification with draft-and-confirm for all write actions."""

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from groq import Groq
from sqlalchemy.orm import Session

from core.config import settings
from db.models import TaskLog, User
from tools.calendar_tool import create_event, get_upcoming_events
from tools.gmail_tool import read_recent_emails, send_email
from tools.slack_tool import list_slack_channels, send_slack_message
from tools.telegram_tool import send_telegram_message

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

WRITE_INTENTS = frozenset({
    "schedule_meeting", "send_email", "send_telegram", "send_slack", "create_task",
})

READ_INTENTS = frozenset({"check_calendar", "check_emails"})

HALLUCINATIONS = {
    "thank you", "thanks for watching", "thanks for listening",
    "please subscribe", "bye", "you",
}

CONFIRM_PHRASES = (
    "send it", "send", "looks good", "look good", "it's good", "it is good",
    "that's good", "thats good", "go ahead", "do it", "confirm", "approved",
    "yes please", "yes", "sure", "okay send", "ok send", "perfect", "go for it",
    "please send", "sounds good", "all good", "that works", "do that",
)

CANCEL_PHRASES = (
    "cancel", "don't send", "do not send", "never mind", "nevermind",
    "abort", "stop", "no don't", "don't do", "do not", "scratch that",
    "forget it", "not now", "hold on", "wait",
)

SYSTEM_PROMPT = """You are AETHER, an AI executive assistant for voice mode.

Classify the user's intent and extract parameters. NEVER claim an action was executed — write actions are drafted first and need voice confirmation.

Intents:
- schedule_meeting: calendar event (REQUIRES attendee email addresses)
- send_email: email (REQUIRES recipient email in "to")
- send_telegram: Telegram message
- send_slack: Slack message
- check_calendar: read upcoming events (read-only, immediate)
- check_emails: read inbox (read-only, immediate)
- create_task: add a task
- general_chat: conversation only

Respond JSON only:
{
  "intent": "send_email",
  "action_params": {
    "to": "john@company.com",
    "subject": "Project Update",
    "body": "Hi John, here is the latest update on the project."
  },
  "spoken_response": "optional short note — draft preview is generated server-side"
}

Rules:
- schedule_meeting: put known emails in "attendees". Put person names (no @) in "attendee_names" — e.g. {"attendee_names": ["Ronit Shah"]}.
- send_email: use "to" as email OR person name if email unknown. Include subject and body.
- Do NOT invent email addresses. Use names when the user says a name.
- send_telegram / send_slack: include "message" text.
- create_task: include "title".
- check_calendar / check_emails / general_chat: action_params can be empty.
- For schedule_meeting use ISO date YYYY-MM-DD in action_params.date.
- Parse times precisely: "3pm", "15:00", "tomorrow morning" → concrete time in action_params.time.
- For relative dates ("next Monday", "this Friday") resolve to YYYY-MM-DD.
- Today is {today}. Timezone: Asia/Kolkata (IST).

Voice style (critical):
- spoken_response: 1–3 short spoken sentences max. No markdown, bullets, or symbols.
- Be direct. For scheduling, always capture title, date, time, duration, and attendees.
"""

INTENT_HINTS = {
    "check_emails": "Checking inbox…",
    "send_email": "Drafting email…",
    "schedule_meeting": "Checking calendar…",
    "check_calendar": "Checking calendar…",
    "send_slack": "Preparing Slack message…",
    "send_telegram": "Preparing Telegram message…",
    "create_task": "Creating task…",
    "general_chat": "Thinking…",
}


def _groq_client() -> Groq:
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured")
    return Groq(api_key=settings.GROQ_API_KEY)


def _valid_email(addr: str) -> bool:
    return bool(addr and EMAIL_RE.match(addr.strip()))


def _normalize_attendees(raw) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, str):
        parts = re.split(r"[,;\s]+", raw)
        return [p.strip() for p in parts if "@" in p]
    return [str(a).strip() for a in raw if a and "@" in str(a)]


def _parse_time_on_date(day: datetime.date, time_str: str) -> datetime:
    time_str = (time_str or "10:00 AM").strip()
    for fmt in ("%I:%M %p", "%H:%M", "%I:%M%p", "%H:%M:%S"):
        try:
            t = datetime.strptime(time_str.upper().replace("  ", " "), fmt).time()
            return datetime.combine(day, t, tzinfo=IST)
        except ValueError:
            continue
    return datetime.combine(day, datetime.strptime("10:00", "%H:%M").time(), tzinfo=IST)


def _resolve_start_end(params: dict) -> tuple[str, str]:
    now = datetime.now(IST)
    date_str = (params.get("date") or "today").strip().lower()

    if date_str == "today":
        day = now.date()
    elif date_str == "tomorrow":
        day = (now + timedelta(days=1)).date()
    else:
        try:
            day = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
        except ValueError:
            day = now.date()

    start_dt = _parse_time_on_date(day, params.get("time", "10:00 AM"))
    duration = int(params.get("duration_minutes") or 60)
    end_dt = start_dt + timedelta(minutes=duration)

    return (
        start_dt.strftime("%Y-%m-%d %I:%M %p"),
        end_dt.strftime("%Y-%m-%d %I:%M %p"),
    )


def _format_event_time(iso_str: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00")).astimezone(IST)
        return dt.strftime("%I:%M %p")
    except Exception:
        return iso_str


def _build_calendar_response(events: list) -> str:
    if not events:
        return "Your calendar is clear."
    parts = []
    for e in events[:5]:
        when = _format_event_time(e.get("start", ""))
        parts.append(f"{e.get('title', 'Event')} at {when}")
    return "Here's your schedule: " + "; ".join(parts) + "."


def _build_emails_response(emails: list) -> str:
    if not emails:
        return "You have no recent emails in your inbox."
    parts = []
    for e in emails[:5]:
        parts.append(f"From {e.get('from', 'Unknown')}: {e.get('subject', 'No subject')}")
    return "Recent emails: " + "; ".join(parts) + "."


def _truncate(text: str, n: int = 120) -> str:
    text = (text or "").strip()
    if len(text) <= n:
        return text
    return text[: n - 3] + "..."


def _format_spoken(text: str, max_sentences: int = 3) -> str:
    """Strip markdown and cap length for TTS."""
    if not text:
        return text
    clean = text.strip()
    clean = re.sub(r"\*\*(.+?)\*\*", r"\1", clean)
    clean = re.sub(r"\*(.+?)\*", r"\1", clean)
    clean = re.sub(r"`(.+?)`", r"\1", clean)
    clean = re.sub(r"\[(.+?)\]\([^)]+\)", r"\1", clean)
    clean = re.sub(r"#{1,6}\s*", "", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    parts = re.split(r"(?<=[.!?])\s+", clean)
    parts = [p for p in parts if p]
    if len(parts) > max_sentences:
        clean = " ".join(parts[:max_sentences])
    return clean


def _intent_hint(intent: str) -> str:
    return INTENT_HINTS.get(intent, "Processing…")


def _finalize_voice_response(result: dict) -> dict:
    intent = result.get("intent", "")
    return {
        **result,
        "spoken_response": _format_spoken(result.get("spoken_response") or ""),
        "intent_hint": _intent_hint(intent),
    }


def _confirm_suffix() -> str:
    return " Say send or looks good to confirm, or say cancel to abort."


def _parse_contact_choice(text: str, count: int) -> Optional[int]:
    t = text.lower().strip().rstrip(".")
    if t.startswith("contact_pick:"):
        try:
            idx = int(t.split(":", 1)[1])
            return idx if 0 <= idx < count else None
        except ValueError:
            return None

    ordinals = [
        ("first one", 0), ("the first", 0), ("first", 0), ("1st", 0), ("option 1", 0), ("option one", 0), ("number 1", 0), ("one", 0),
        ("second one", 1), ("the second", 1), ("second", 1), ("2nd", 1), ("option 2", 1), ("option two", 1), ("number 2", 1), ("two", 1),
        ("third one", 2), ("the third", 2), ("third", 2), ("3rd", 2), ("option 3", 2), ("three", 2),
    ]
    for phrase, idx in ordinals:
        if idx < count and (t == phrase or phrase in t):
            return idx
    if t.isdigit():
        n = int(t) - 1
        return n if 0 <= n < count else None
    return None


async def _resolve_contacts_for_action(
    db: Session, user_id: str, intent: str, params: dict
) -> Optional[dict]:
    """Resolve names to emails. Returns pending_action dict, error dict, or None if resolved."""
    from services.contact_resolver import resolve_contacts_by_name

    if intent == "schedule_meeting":
        emails = [a for a in _normalize_attendees(params.get("attendees")) if "@" in a]
        names = list(params.get("attendee_names") or [])
        for a in _normalize_attendees(params.get("attendees")):
            if a and "@" not in a:
                names.append(a)
        for a in params.get("attendees") or []:
            if isinstance(a, str) and "@" not in a and a not in names:
                names.append(a.strip())

        pending_names = list(params.get("_pending_names") or names)
        resolved = list(params.get("_resolved_emails") or emails)

        while pending_names:
            name = pending_names.pop(0).strip()
            if not name:
                continue
            options = resolve_contacts_by_name(db, user_id, name)
            if not options:
                return {"error_spoken": f"I couldn't find an email for {name}. Please say their email address."}
            if len(options) == 1:
                resolved.append(options[0]["email"])
                continue
            return {
                "stage": "contact_pick",
                "intent": intent,
                "action_params": params,
                "resolving_name": name,
                "contact_options": options,
                "_resolved_emails": resolved,
                "_pending_names": pending_names,
            }

        params["attendees"] = resolved
        params.pop("attendee_names", None)
        return None

    if intent == "send_email":
        to = (params.get("to") or "").strip()
        if not to:
            return {"error_spoken": "Who should I send the email to?"}
        if _valid_email(to):
            return None
        options = resolve_contacts_by_name(db, user_id, to)
        if not options:
            return {"error_spoken": f"I couldn't find an email for {to}. Please say their email address."}
        if len(options) == 1:
            params["to"] = options[0]["email"]
            return None
        return {
            "stage": "contact_pick",
            "intent": intent,
            "action_params": params,
            "resolving_name": to,
            "contact_options": options,
            "_resolved_emails": [],
            "_pending_names": [],
        }

    return None


async def _handle_contact_pick(
    db: Session, user_id: str, user_text: str, pending_action: dict
) -> dict:
    from services.contact_resolver import build_contact_pick_prompt

    if _detect_confirmation(user_text) is False:
        return {
            "spoken_response": "Okay, I've cancelled that.",
            "intent": pending_action.get("intent", ""),
            "action_taken": False,
            "pending_confirmation": False,
            "pending_action": None,
            "contact_options": None,
            "action_result": {"success": True, "cancelled": True},
        }

    options = pending_action.get("contact_options") or []
    idx = _parse_contact_choice(user_text, len(options))

    if idx is None:
        name = pending_action.get("resolving_name", "this person")
        return {
            "spoken_response": "I didn't catch that. " + build_contact_pick_prompt(name, options),
            "intent": pending_action.get("intent", ""),
            "action_taken": False,
            "pending_confirmation": True,
            "pending_action": pending_action,
            "contact_options": options,
            "action_result": None,
        }

    intent = pending_action["intent"]
    params = dict(pending_action.get("action_params") or {})

    if intent == "schedule_meeting":
        resolved = list(pending_action.get("_resolved_emails") or [])
        resolved.append(options[idx]["email"])
        params["attendees"] = resolved
        params["_resolved_emails"] = resolved
        params["_pending_names"] = list(pending_action.get("_pending_names") or [])
    elif intent == "send_email":
        params["to"] = options[idx]["email"]

    more = await _resolve_contacts_for_action(db, user_id, intent, params)
    if more:
        if more.get("error_spoken"):
            return {
                "spoken_response": more["error_spoken"],
                "intent": intent,
                "action_taken": False,
                "pending_confirmation": False,
                "pending_action": None,
                "contact_options": None,
                "action_result": None,
            }
        if more.get("stage") == "contact_pick":
            name = more["resolving_name"]
            return {
                "spoken_response": build_contact_pick_prompt(name, more["contact_options"]),
                "intent": intent,
                "action_taken": False,
                "pending_confirmation": True,
                "pending_action": more,
                "contact_options": more["contact_options"],
                "action_result": None,
            }

    return await _build_confirm_pending(intent, params)


async def _build_confirm_pending(intent: str, params: dict) -> dict:
    validation_err = validate_write_action(intent, params)
    if validation_err:
        return {
            "spoken_response": validation_err,
            "intent": intent,
            "action_taken": False,
            "pending_confirmation": False,
            "pending_action": None,
            "contact_options": None,
            "action_result": None,
        }

    draft = build_draft_preview(intent, params)
    clean_params = {k: v for k, v in params.items() if not k.startswith("_")}
    return {
        "spoken_response": draft + _confirm_suffix(),
        "intent": intent,
        "action_taken": False,
        "pending_confirmation": True,
        "pending_action": {"stage": "confirm", "intent": intent, "action_params": clean_params},
        "contact_options": None,
        "action_result": None,
    }


def validate_write_action(intent: str, params: dict) -> Optional[str]:
    """Return spoken error if params invalid, else None."""
    if intent == "schedule_meeting":
        attendees = [a for a in _normalize_attendees(params.get("attendees")) if _valid_email(a)]
        params["attendees"] = attendees
        if not attendees:
            return "I need email addresses for the meeting attendees. Who should I invite?"

    elif intent == "send_email":
        to = (params.get("to") or "").strip()
        if not to:
            return "Who should I send the email to? Please give me their email address."
        if not _valid_email(to):
            return f"I still need a valid email address for the recipient."
        if not (params.get("subject") or "").strip():
            params["subject"] = "Message from Aether"
        if not (params.get("body") or "").strip():
            return "What should the email say? Tell me the message content."

    elif intent in ("send_telegram", "send_slack"):
        if not (params.get("message") or "").strip():
            return "What message should I send?"

    elif intent == "create_task":
        if not (params.get("title") or "").strip():
            return "What task should I add?"

    return None


def build_draft_preview(intent: str, params: dict) -> str:
    if intent == "schedule_meeting":
        title = params.get("title") or "Meeting"
        time_str = params.get("time") or "10:00 AM"
        date_str = params.get("date") or "today"
        attendees = _normalize_attendees(params.get("attendees"))
        emails = ", ".join(attendees)
        return (
            f"I've prepared a meeting called {title}, on {date_str} at {time_str}, "
            f"with invites to {emails}."
        )

    if intent == "send_email":
        to = params.get("to", "")
        subject = params.get("subject", "")
        body = _truncate(params.get("body", ""), 100)
        return (
            f"I've drafted an email to {to}. Subject: {subject}. "
            f"Message: {body}"
        )

    if intent == "send_telegram":
        msg = _truncate(params.get("message", ""), 100)
        return f"I've drafted a Telegram message: {msg}"

    if intent == "send_slack":
        channel = params.get("channel_name") or params.get("channel") or "general"
        msg = _truncate(params.get("message", ""), 100)
        return f"I've drafted a Slack message for #{str(channel).lstrip('#')}: {msg}"

    if intent == "create_task":
        title = params.get("title", "")
        due = params.get("due_date")
        extra = f", due {due}" if due else ""
        return f"I've prepared a task: {title}{extra}."

    return "I've prepared that action."


def _detect_confirmation(text: str) -> Optional[bool]:
    """True=confirm, False=cancel, None=unclear."""
    t = text.lower().strip().rstrip(".")

    for phrase in CANCEL_PHRASES:
        if phrase in t or t == phrase:
            return False

    for phrase in CONFIRM_PHRASES:
        if phrase in t or t == phrase:
            return True

    if t in ("no", "nope"):
        return False
    if t in ("yep", "yeah", "yup"):
        return True

    return None


async def classify_and_plan(user_text: str, history: list) -> dict:
    from llm.client import AllProvidersFailedError, chat_complete_json

    today = datetime.now(IST).strftime("%A, %B %d %Y, %I:%M %p IST")
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT.replace("{today}", today)},
        *history[-6:],
        {"role": "user", "content": user_text},
    ]

    try:
        raw = chat_complete_json(messages, tier="fast", temperature=0.2, max_tokens=1024)
        return json.loads(raw or "{}")
    except (json.JSONDecodeError, TypeError):
        logger.warning("[Voice] Intent JSON parse failed, using keyword fallback")
        return _keyword_intent_fallback(user_text)
    except AllProvidersFailedError as e:
        logger.warning("[Voice] LLM rate-limited, using keyword fallback: %s", e)
        return _keyword_intent_fallback(user_text)
    except Exception as e:
        logger.warning("[Voice] classify error (%s), using keyword fallback", e)
        return _keyword_intent_fallback(user_text)


def _keyword_intent_fallback(user_text: str) -> dict:
    """Lightweight intent routing when LLM providers are unavailable."""
    t = user_text.lower()
    if any(k in t for k in ("calendar", "meeting", "schedule", "appointment", "book a")):
        if any(k in t for k in ("what", "show", "check", "upcoming", "my schedule")):
            return {"intent": "check_calendar", "action_params": {}}
        return {"intent": "schedule_meeting", "action_params": {"title": user_text[:80]}}
    if any(k in t for k in ("email", "mail", "inbox")):
        if any(k in t for k in ("check", "read", "show", "recent", "inbox")):
            return {"intent": "check_emails", "action_params": {}}
        return {"intent": "send_email", "action_params": {"body": user_text}}
    if "slack" in t:
        return {"intent": "send_slack", "action_params": {"message": user_text}}
    if "telegram" in t:
        return {"intent": "send_telegram", "action_params": {"message": user_text}}
    if any(k in t for k in ("task", "todo", "remind")):
        return {"intent": "create_task", "action_params": {"title": user_text[:120]}}
    return {"intent": "general_chat", "action_params": {}, "spoken_response": ""}


async def execute_action(db: Session, user_id: str, intent: str, params: dict) -> dict:
    handlers = {
        "schedule_meeting": _handle_schedule_meeting,
        "send_email": _handle_send_email,
        "send_telegram": _handle_send_telegram,
        "send_slack": _handle_send_slack,
        "check_calendar": _handle_check_calendar,
        "check_emails": _handle_check_emails,
        "create_task": _handle_create_task,
    }

    handler = handlers.get(intent)
    if not handler:
        return {"success": True, "note": "no action required"}

    try:
        return await handler(db, user_id, params)
    except Exception as e:
        logger.exception("Voice action %s failed: %s", intent, e)
        return {"success": False, "error": str(e)}


async def _handle_confirmation(
    db: Session,
    user_id: str,
    user_text: str,
    pending_action: dict,
) -> dict:
    if pending_action.get("stage") == "contact_pick":
        return _finalize_voice_response(
            await _handle_contact_pick(db, user_id, user_text, pending_action)
        )

    intent = pending_action.get("intent", "")
    params = pending_action.get("action_params") or {}
    decision = _detect_confirmation(user_text)

    if decision is False:
        return _finalize_voice_response({
            "spoken_response": "Okay, I've cancelled that.",
            "intent": intent,
            "action_taken": False,
            "pending_confirmation": False,
            "pending_action": None,
            "contact_options": None,
            "action_result": {"success": True, "cancelled": True},
        })

    if decision is None:
        return _finalize_voice_response({
            "spoken_response": "I didn't catch that. Say send or looks good to confirm, or say cancel.",
            "intent": intent,
            "action_taken": False,
            "pending_confirmation": True,
            "pending_action": pending_action,
            "contact_options": None,
            "action_result": None,
        })

    # Confirmed — execute
    action_result = await execute_action(db, user_id, intent, params)

    if action_result.get("success"):
        spoken = _build_success_message(intent, params)
    else:
        err = action_result.get("error", "Something went wrong")
        spoken = f"Sorry, I couldn't complete that. {err}"

    return _finalize_voice_response({
        "spoken_response": spoken,
        "intent": intent,
        "action_taken": True,
        "pending_confirmation": False,
        "pending_action": None,
        "contact_options": None,
        "action_result": action_result,
    })


def _build_success_message(intent: str, params: dict) -> str:
    if intent == "schedule_meeting":
        return f"Done. Meeting {params.get('title', 'scheduled')} is on the calendar and invites are sent."
    if intent == "send_email":
        return f"Done. Email sent to {params.get('to')}."
    if intent == "send_telegram":
        return "Done. Telegram message sent."
    if intent == "send_slack":
        ch = params.get("channel_name") or params.get("channel") or "Slack"
        return f"Done. Message posted to {ch}."
    if intent == "create_task":
        return f"Done. Task added: {params.get('title')}."
    return "Done."


async def process_voice_command(
    db: Session,
    user_id: str,
    user_text: str,
    history: list,
    pending_action: Optional[dict] = None,
) -> dict:
    # ── Confirmation turn ─────────────────────────────────────
    if pending_action and pending_action.get("intent"):
        return await _handle_confirmation(db, user_id, user_text, pending_action)

    result = await classify_and_plan(user_text, history)
    intent = result.get("intent", "general_chat")
    params = result.get("action_params") or {}

    # ── Read-only / chat — execute or answer immediately ──────
    if intent in READ_INTENTS or intent == "general_chat":
        spoken = (result.get("spoken_response") or "").strip()
        action_result: dict = {"success": True}

        if intent in READ_INTENTS:
            action_result = await execute_action(db, user_id, intent, params)
            if intent == "check_calendar" and action_result.get("success"):
                spoken = _build_calendar_response(action_result.get("events", []))
            elif intent == "check_emails" and action_result.get("success"):
                spoken = _build_emails_response(action_result.get("emails", []))
            elif not action_result.get("success"):
                spoken = f"Sorry, I couldn't fetch that. {action_result.get('error', '')}"

        if not spoken:
            spoken = "I'm here. What would you like me to do?"

        return _finalize_voice_response({
            "spoken_response": spoken,
            "intent": intent,
            "action_taken": intent in READ_INTENTS,
            "pending_confirmation": False,
            "pending_action": None,
            "contact_options": None,
            "action_result": action_result,
        })

    # ── Write actions — resolve contacts, draft, wait for confirm ─
    if intent in WRITE_INTENTS:
        contact_result = await _resolve_contacts_for_action(db, user_id, intent, params)
        if contact_result:
            if contact_result.get("error_spoken"):
                return _finalize_voice_response({
                    "spoken_response": contact_result["error_spoken"],
                    "intent": intent,
                    "action_taken": False,
                    "pending_confirmation": False,
                    "pending_action": None,
                    "contact_options": None,
                    "action_result": None,
                })
            if contact_result.get("stage") == "contact_pick":
                from services.contact_resolver import build_contact_pick_prompt
                name = contact_result["resolving_name"]
                return _finalize_voice_response({
                    "spoken_response": build_contact_pick_prompt(name, contact_result["contact_options"]),
                    "intent": intent,
                    "action_taken": False,
                    "pending_confirmation": True,
                    "pending_action": contact_result,
                    "contact_options": contact_result["contact_options"],
                    "action_result": None,
                })

        return _finalize_voice_response(await _build_confirm_pending(intent, params))

    spoken = (result.get("spoken_response") or "I'm here. What would you like?").strip()
    return _finalize_voice_response({
        "spoken_response": spoken,
        "intent": intent,
        "action_taken": False,
        "pending_confirmation": False,
        "pending_action": None,
        "contact_options": None,
        "action_result": None,
    })


# ── Action handlers ───────────────────────────────────────────

async def _handle_schedule_meeting(db: Session, user_id: str, params: dict) -> dict:
    start_fmt, end_fmt = _resolve_start_end(params)
    attendees = _normalize_attendees(params.get("attendees"))
    event = create_event(
        title=params.get("title", "Meeting"),
        start_datetime=start_fmt,
        end_datetime=end_fmt,
        attendees=attendees,
        description=params.get("description", ""),
        location=params.get("location", ""),
        db=db,
        user_id=user_id,
    )
    return {"success": True, "event_id": event.get("id")}


async def _handle_send_email(db: Session, user_id: str, params: dict) -> dict:
    to = params.get("to", "").strip()
    if not _valid_email(to):
        raise ValueError("Valid recipient email is required")
    result = send_email(
        db=db,
        user_id=user_id,
        to=to,
        subject=params.get("subject", ""),
        body=params.get("body", ""),
    )
    return {"success": True, "message_id": result.get("id")}


async def _handle_send_telegram(db: Session, user_id: str, params: dict) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.telegram_chat_id:
        raise RuntimeError("Telegram is not connected")
    text = params.get("message", "")
    if not text.strip():
        raise ValueError("Message text is required")
    ok = send_telegram_message(str(user.telegram_chat_id), text)
    if not ok:
        raise RuntimeError("Failed to send Telegram message")
    return {"success": True}


async def _handle_send_slack(db: Session, user_id: str, params: dict) -> dict:
    text = params.get("message", "")
    if not text.strip():
        raise ValueError("Message text is required")

    channel_id = params.get("channel_id")
    channel_name = (params.get("channel_name") or params.get("channel") or "general").lstrip("#")

    if not channel_id or str(channel_id).startswith("#"):
        channels = list_slack_channels(db, user_id)
        for c in channels:
            if c["name"] == channel_name:
                channel_id = c["id"]
                break

    if not channel_id:
        raise ValueError(f"Slack channel '{channel_name}' not found")

    formatted = re.sub(r"\*\*(.*?)\*\*", r"*\1*", text)
    res = send_slack_message(db, user_id, channel_id, formatted)
    return {"success": True, "ts": res.get("ts")}


async def _handle_check_calendar(db: Session, user_id: str, params: dict) -> dict:
    max_results = int(params.get("limit") or params.get("days", 1) * 5 or 5)
    events = get_upcoming_events(db=db, user_id=user_id, max_results=max_results)
    return {"success": True, "events": events}


async def _handle_check_emails(db: Session, user_id: str, params: dict) -> dict:
    limit = int(params.get("limit", 5))
    emails = read_recent_emails(db=db, user_id=user_id, max_results=limit)
    return {"success": True, "emails": emails}


async def _handle_create_task(db: Session, user_id: str, params: dict) -> dict:
    title = params.get("title")
    if not title:
        raise ValueError("Task title is required")

    log = TaskLog(
        user_id=user_id,
        kind="execution",
        input=title,
        intent="task",
        output=f"Task created: {title}",
        approved=True,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"success": True, "task_id": str(log.id)}
