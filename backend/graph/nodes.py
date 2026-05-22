import os
import json
import re
import requests
import base64
import logging
import asyncio
from datetime import datetime
from .state import State
from db.database import get_db
from db.models import A2AMessageLog, User, AgentRegistry
from services.agent_registry import search_agent_by_handle, push_to_inbox
from services.scheduling_negotiation import find_common_slots, get_free_windows
from schemas.a2a_message import A2AMessage
from utils.briefing import generate_daily_briefing

logger = logging.getLogger(__name__)

from .llm_utils import _llm


def generate_hf_image(prompt: str) -> str:
    import urllib.parse
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=768&model=flux&nologo=true"

    # Return the direct URL for browser-side loading (more reliable than huge base64 strings)
    return url

def _parse_json(text: str) -> dict:
    import re
    clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    try:
        return json.loads(clean)
    except Exception:
        match = re.search(r"\{.*\}", clean, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {}


def _clean_output(text: str) -> str:
    text = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"</?reply>", "", text, flags=re.IGNORECASE)
    # 🔴 CRITICAL: Strip huge base64 data URLs that bloat token count
    text = re.sub(r"data:image/[^;]+;base64,[^\s\"'}]*", "[IMAGE_DATA_OMITTED]", text)
    text = text.strip()
    return text


def classifier_node(state: State):
    """Categorizes user intent and extracts cross-twin context."""
    user_input = state["input"].lower()
    history = state.get("chat_history") or []

    # Use explicit intent hints from the UI when available.
    intent_hint = (state.get("intent_hint") or "").strip().lower()
    intent_map = {
        "email": "email_read",
        "email_draft": "email_draft",
        "email_read": "email_read",
        "email_send": "email_send",
        "email_search": "email_search",
        "draft_email": "email_draft",
        "reply_to_email": "email_reply",
        "schedule": "calendar",
        "scheduling": "calendar",   
        "calendar": "calendar",
        "meeting": "calendar",
        "image": "visual",
        "image_creation": "visual",
        "visual": "visual",
        "create_image": "visual",
        "file": "file_generate",
        "file_generate": "file_generate",
        "file_read": "file_read",
        "visualize": "visualize",
        "slack": "slack_send",
        "slack_send": "slack_send",
        "slack_read": "slack_read",
        "slack_channels": "slack_channels",
        "telegram": "telegram_send",
        "telegram_send": "telegram_send",
        "telegram_read": "telegram_read",
        "whatsapp": "whatsapp_send",
        "whatsapp_send": "whatsapp_send",
        "whatsapp_read": "whatsapp_read",
        "general": "general",
        "other": "general",
        "files": "file_read",
    }
    if intent_hint in intent_map:
        return {**state, "intent": intent_map[intent_hint]}

    # ⚡ FAST-PATH: Images uploaded → always route to 'question' (vision model handles it)
    uploaded_files = state.get("files", [])
    has_images = any(f.get("type", "").startswith("image/") for f in uploaded_files)
    has_non_images = any(not f.get("type", "").startswith("image/") for f in uploaded_files)
    if has_images or has_non_images:
        return {**state, "intent": "question"}

    # Fast-path for confirmations (Yes/Sure/Do it)
    last_ai_msgs = [m["text"].lower() for m in history[-3:] if m.get("role") in ("ai", "assistant")]
    last_ai_msg = last_ai_msgs[-1] if last_ai_msgs else ""
    is_confirmation = any(word in user_input for word in ["yes", "yeah", "sure", "do it", "ok", "go ahead", "send it", "book it", "confirm", "proceed", "approved"])
    
    if is_confirmation and last_ai_msg:
        if "briefing" in last_ai_msg: return {**state, "intent": "slack_send"}
        if any(k in last_ai_msg for k in ["schedule", "meeting", "calendar", "invite", "slot"]): 
            return {**state, "intent": "scheduling"}
        # Email confirmation — user confirmed sending a draft
        if any(k in last_ai_msg for k in ["draft", "email", "mail", "gmail", "subject", "dear", "regards", "body"]):
            return {**state, "intent": "email_send"}

    # Scheduling / Calendar (check BEFORE email — "invite" should route here)
    if any(k in user_input for k in ["schedule", "meeting", "calendar", "event", "availability", "free slot", "book a", "set up a", "invite", "meet", "call"]):
        return {**state, "intent": "scheduling"}

    # Gmail/Email — explicit email words
    if any(k in user_input for k in ["email", "mail", "gmail", "inbox", "messages"]):
        if any(k in user_input for k in [
            "search", "find", "show", "show me", "read", "unread", "recent", "what did",
            "check", "promotion", "offer", "deal", "bank", "statement", "receipt",
            "invoice", "order", "shipping", "delivery", "who", "last", "latest",
            "when", "did", "any new", "get", "list", "fetch"
        ]):
            return {**state, "intent": "email_read"}
        return {**state, "intent": "email_draft"}

    # Implicit email search — user asks about topics that live in their inbox (no 'email' keyword needed)
    implicit_search_triggers = [
        "laptop deal", "laptop promotion", "discount", "offer", "bank statement", "last statement",
        "receipt from", "order from", "invoice from", "shipping update", "delivery update",
        "flight booking", "hotel booking", "subscription", "renewal", "payment confirmation",
        "new offer", "sale on", "promo code", "coupon"
    ]
    if any(trigger in user_input for trigger in implicit_search_triggers):
        return {**state, "intent": "email_search"}

    # telegram / slack / email / whatsapp action prioritization
    read_keywords = ["read", "get", "show", "history", "recent", "received", "last", "what did", "what was", "inbox", "chats"]
    if "whatsapp" in user_input:
        if any(kw in user_input for kw in read_keywords):
            return {**state, "intent": "whatsapp_read"}
        return {**state, "intent": "whatsapp_send"}
    if "telegram" in user_input:
        if any(kw in user_input for kw in read_keywords):
            return {**state, "intent": "telegram_read"}
        return {**state, "intent": "telegram_send"}
    if "slack" in user_input and "briefing" not in user_input:
        if any(kw in user_input for kw in read_keywords):
            return {**state, "intent": "slack_read"}
        return {**state, "intent": "slack_send"}

    # Image generation fast-path — MUST come BEFORE file generation checks
    image_keywords = [
        'generate an image', 'create an image', 'make an image',
        'generate image', 'create image', 'make image',
        'draw ', 'illustrate ', 'show me a picture', 'create a picture',
        'generate a picture', 'make a picture', 'generate a photo',
        'create a photo', 'make a photo',
    ]
    if any(kw in user_input for kw in image_keywords):
        return {**state, "intent": "visual"}

    # File generation fast-path — only for documents, NOT images
    file_gen_triggers = [
        "create a file", "make a file", "write a file",
        "create pdf", "generate pdf", "create a pdf", "make a pdf",
        "write report", "make a report", "create a report",
        "create spreadsheet", "make excel", "generate excel", "create xlsx",
        "make a presentation", "create slides", "generate pptx",
        "write a script", "write python", "write code", "generate code",
        "create readme", "generate readme", "write markdown",
        "make invoice", "create invoice", "generate invoice",
        "write resume", "create resume", "generate resume",
        "create json", "generate json", "create yaml", "generate yaml",
        "meeting summary", "create summary", "generate summary",
        "write an essay", "create an essay", "write essay",
        "write a doc", "create a doc",
    ]
    if any(trigger in user_input for trigger in file_gen_triggers):
        return {**state, "intent": "file_generate"}

    # Visualization fast-path
    viz_triggers = [
        "visualize", "chart", "graph", "plot", "dashboard", "analytics",
        "bar chart", "line chart", "pie chart", "histogram", "heatmap",
        "show me trends", "trend analysis", "data analysis", "visualise",
        "show chart", "make chart", "generate chart", "create chart",
    ]
    if any(trigger in user_input for trigger in viz_triggers):
        return {**state, "intent": "visualize"}

    result = _llm(
        system="""
You are a strict intent classifier for an AI Twin.
Your goal is to categorize the user's intent EXACTLY into one of these:

1. 'email_read':
   "show my emails", "find my latest 5 mails", "what's in my inbox",
   "read my messages", "check my email", "any new mails",
   "latest emails from X", "unread messages", "fetch my emails",
   "show unread", "list my mails", "get my inbox"

2. 'email_draft':
   "draft a reply to X", "write an email to Y",
   "compose a message to Z", "help me reply to"

3. 'email_send':
   "send that email", "approve and send", "send this to X"

4. 'calendar':
   "what's on my calendar", "my schedule today",
   "upcoming meetings", "events this week",
   "what do I have tomorrow", "show my agenda"

5. 'calendar_create':
   "schedule a meeting with X", "book a call",
   "set up a meeting", "create an event",
   "schedule X for tomorrow at 3pm"

6. 'slack_send':
   "post to #channel", "send message to slack",
   "tell the team X in slack", "message #general"

7. 'slack_read':
   "what's new in slack", "show #general", "any slack messages"

8. 'telegram_send':
   "send hi on telegram", "send via telegram",
   "notify me on telegram", "message on telegram",
   "send telegram message"

9. 'telegram_read':
   "what did I get on telegram", "telegram updates"

10. 'whatsapp_send':
    "send whatsapp to X", "whatsapp X saying Y",
    "msg X on whatsapp"

11. 'whatsapp_read':
    "read my whatsapp messages"

12. 'visual':
    "generate an image", "create a visual of X",
    "make an image of X", "draw X", "create image"

13. 'file_generate':
    "generate a PDF", "create a report", "make a spreadsheet",
    "write a Python script", "create a presentation",
    "generate a README", "make an invoice", "draft a resume"

14. 'visualize':
    "show me a chart", "visualize this data",
    "create a bar chart", "plot these numbers",
    "dashboard of my expenses", "generate a bar graph",
    "generate a chart", "make a pie chart"

15. 'file_read':
    "summarise this file", "read this document",
    "what's in this PDF", "analyze this file"

16. 'calendar_freebusy':
    "am I free at X", "check my availability", "when am I free"

17. 'general':
    "hi", "thanks", casual conversation, questions,
    or anything else not explicitly an action.

RULES:
- Be highly accurate. Do not misclassify simple conversational messages
  ("hello", "thanks", "ok") as actions.
- If the user says "Draft an email", "Write an email", or "Email X", ALWAYS use 'email_draft', even if they mention a "meeting", "event", or "chart".
- If the user mentions "chart", "graph", "dashboard", or specific data charts like "pie" or "bar", ALWAYS use 'visualize', even if they say "generate" or "create".
- If the user mentions "map", "satellite", "sketch", "draw", "art", "realistic", "photo", or "image", ALWAYS use 'visual', even if they say "visualize" or "create".
- ONLY use 'file_generate' for text documents (PDF, DOCX, TXT), scripts, or presentations. DO NOT use it for images or photos.
- If it's a hybrid/mixed intent, classify based on the primary action.
- Return ONLY valid JSON: {"intent":"category", "target_handle": "null_or_handle"}
""",
        user=state["input"],
    )
    parsed = _parse_json(result)
    intent = parsed.get("intent", "general")

    valid_intents = [
        "email_read", "email_draft", "email_send",
        "calendar", "calendar_create", "calendar_freebusy",
        "slack_send", "slack_read",
        "telegram_send", "telegram_read",
        "whatsapp_send", "whatsapp_read",
        "visual", "file_read", "file_generate", "visualize", "general",
        "schedule_with_twin", "twin_message"
    ]
    if intent not in valid_intents:
        logger.warning(
            f"[Classifier] Unrecognised intent '{intent}' from LLM — "
            f"defaulting to 'general'. Input: {state['input'][:80]}"
        )
        intent = "general"

    logger.info(f"[Classifier] Input: {state['input'][:80]} → Intent: {intent}")

    return {**state, "intent": intent, "target_user_handle": parsed.get("target_handle")}


async def memory_node(state: State) -> State:
    # 1. Generate Contextual Search Query
    # If it's a short/ambiguous input, we use history to make it a better RAG query.
    history_context = ""
    if state.get("chat_history"):
        history_context = "\n".join([f"{m.get('role')}: {_clean_output(m.get('text', ''))}" for m in state["chat_history"]])
    
    query = state["input"]
    if len(query.split()) < 4 and history_context:
        query = _llm(
             system="Given the recent conversation, rephrase the user's latest message into a standalone, descriptive search query for a memory database. Output ONLY the query.",
             user=f"History:\n{history_context}\n\nLatest: {state['input']}"
        )
        logger.info(f"[Memory] Contextualized Query: {query}")

    user_id = state["user_id"]
    intent = state.get("intent", "general")
    context = ""

    # ── MCP PATH ─────────────────────────────────────────────────────────────
    import asyncio as _asyncio
    from mcp.executor import mcp_executor

    # Run memory retrieval (and optional style retrieval) concurrently
    mem_coro = mcp_executor.execute(
        intent="_memory_retrieve",
        args={"user_id": user_id, "query": query, "n": 3},
        user_id=user_id,
    )

    # For email drafts, also retrieve writing-style examples concurrently
    if intent in ("email_draft", "email_send"):
        style_coro = mcp_executor.execute(
            intent="_memory_retrieve",
            args={
                "user_id": user_id,
                "query": state["input"],
                "n": 3,
                "memory_type": "sent_mail",
            },
            user_id=user_id,
        )
        mem_result, style_result = await _asyncio.gather(mem_coro, style_coro)
        style_docs = style_result.get("result", {}).get("results", [])
        if isinstance(style_docs, list):
            state = {**state, "style_context": "\n".join(style_docs)}
    else:
        mem_result = await mem_coro

    context_docs = mem_result.get("result", {}).get("results", [])
    if isinstance(context_docs, list) and context_docs:
        context += "\n[RELEVANT CHAT MEMORY]\n" + "\n".join(context_docs) + "\n"

    # Strip any accidentally stored blobs from context
    clean_context = _clean_output(context)

    return {
        **state,
        "context": clean_context
    }



# ─────────────────────────────────────────────────────────────────────────────
# EXECUTOR NODE  (Sprint 3 — MCP cutover)
async def executor_node(state: State) -> State:
    """Routes tool execution through MCP."""
    intent = state.get("intent", "general")
    user_id = state.get("user_id")

    # MCP PATH
    import mcp.executor as _mcp_exec_mod
    from mcp.executor import mcp_executor

    # Runtime toggle — respect the global MCP_ENABLED flag
    if not getattr(_mcp_exec_mod, "MCP_ENABLED", True):
        logger.warning(f"[Executor] MCP is DISABLED — skipping execution for intent={intent}")
        return state

    # Only dispatch for intents that have an MCP mapping
    dispatchable = [
        "email_read", "email_draft", "email_send",
        "calendar", "calendar_create", "calendar_freebusy",
        "slack_send", "slack_read", "slack_channels",
        "telegram_send", "telegram_read",
        "whatsapp_send", "whatsapp_read",
        "visual", "file_read",
        "schedule_with_twin", "twin_message",
    ]
    if intent not in dispatchable:
        logger.info(f"[Executor] intent={intent} not in MCP dispatch list — skip")
        return state

    # HITL Check: Skip execution if approval is required but not yet granted
    if state.get("approval_required") and not state.get("approved"):
        logger.info(f"[Executor] intent={intent} requires approval — skipping execution for now")
        return state

    args = _build_args_for_intent(intent, state)

    execution = await mcp_executor.execute(
        intent=intent,
        args=args,
        user_id=user_id,
    )

    new_state = dict(state)
    new_state["tool_result"] = execution.get("result", {})
    new_state["execution_error"] = execution.get("error")
    new_state["approval_required"] = execution.get("requires_hitl", False)

    logger.info(
        f"[Executor] intent={intent} ok={execution['ok']} "
        f"hitl={new_state['approval_required']}"
    )
    return new_state


def _build_args_for_intent(intent: str, state: dict) -> dict:
    """
    Extracts the right fields from LangGraph state for each intent's MCP tool call.
    task_plan is a list in the planner, so we check both list[0] (old) and dict (new).
    """
    user_id = state.get("user_id")
    raw_plan = state.get("task_plan", {})
    # Normalise: planner currently stores a list of strings; MCP callers expect a dict.
    task_plan = raw_plan if isinstance(raw_plan, dict) else {}
    base = {"user_id": user_id}

    if intent == "email_read":
        return {**base, "max_results": 5}

    elif intent in ("email_draft", "email_send"):
        return {
            **base,
            "to": task_plan.get("to", ""),
            "subject": task_plan.get("subject", ""),
            "body": task_plan.get("body", ""),
            "context": task_plan.get("context", ""),
        }

    elif intent == "calendar":
        return {**base, "max_results": 20}

    elif intent == "calendar_create":
        return {
            **base,
            "summary": task_plan.get("summary", ""),
            "start_datetime": task_plan.get("start", ""),
            "end_datetime": task_plan.get("end", ""),
            "attendees": task_plan.get("attendees", ""),
            "description": task_plan.get("description", ""),
        }

    elif intent == "slack_send":
        return {
            **base,
            "channel_id": task_plan.get("channel_id", ""),
            "channel_name": task_plan.get("channel_name", ""),
            "text": task_plan.get("text", ""),
        }

    elif intent == "slack_read":
        return {
            **base,
            "channel_id": task_plan.get("channel_id", ""),
            "limit": 10,
        }

    elif intent == "telegram_send":
        return {
            **base,
            "text": task_plan.get("text", state.get("input", "")),
        }

    elif intent == "whatsapp_send":
        return {
            **base,
            "to": task_plan.get("to", ""),
            "message": task_plan.get("message", task_plan.get("text", state.get("input", ""))),
        }

    elif intent == "visual":
        return {
            **base,
            "prompt": task_plan.get("prompt", state.get("input", "")),
        }

    elif intent == "file_read":
        chat_hist = state.get("chat_history", [])
        hist_str = "\\n".join(f"{m.get('role', 'user')}: {m.get('text', '')}" for m in chat_hist[-6:]) if chat_hist else ""
        return {
            **base,
            "file_path": state.get("file_path", ""),
            "user_request": state.get(
                "input",
                "Summarise this file"
            ),
            "chat_history": hist_str,
        }

    elif intent == "telegram_read":
        return {**base}

    elif intent == "calendar_freebusy":
        return {
            **base,
            "time_min": task_plan.get("time_min", ""),
            "time_max": task_plan.get("time_max", ""),
        }

    elif intent == "slack_channels":
        return {**base}

    elif intent == "schedule_with_twin":
        return {
            **base,
            "requester_user_id": user_id,
            "target_user_id": task_plan.get("target_user_id", ""),
            "duration_minutes": task_plan.get("duration_minutes", 30),
            "lookahead_days": task_plan.get("lookahead_days", 7),
        }

    elif intent == "twin_message":
        return {
            **base,
            "sender_user_id": user_id,
            "receiver_user_id": task_plan.get("receiver_user_id", ""),
            "msg_type": task_plan.get("msg_type", "chat"),
            "payload": task_plan.get("payload", {}),
        }

    return base


def planner_node(state: State) -> State:
    result = _llm(
        system="""
You are a task planner and argument extractor.
Based on the user's intent, extract the necessary arguments into a JSON object.

If the intent is 'whatsapp_send', extract: "to" (phone number with country code, OR a recipient person's name if they specified a name like "Arjun" or "Ronit"), "message".
If the intent is 'email_draft' or 'email_send', extract: "to", "subject", "body".
If the intent is 'telegram_send', extract: "text".
If the intent is 'calendar_create', extract: "summary", "start", "end", "description", "attendees".

Return ONLY valid JSON.

Format:
{"task_plan": {"to": "Arjun", "message": "Hello!"}}
""",
        user=f"Input: {state['input']}\nIntent: {state['intent']}",
        force_fast=True
    )

    parsed = _parse_json(result)
    plan = parsed.get("task_plan", {})

    needs_approval = state["intent"] in [
        # BUG 4 FIX: email_draft no longer needs approval (saves to Drafts folder silently)
        "calendar",
        "slack_send",
        "telegram_send",
        "whatsapp_send",
        "scheduling"
    ]

    return {
        **state,
        "task_plan": plan,
        "approval_required": needs_approval
    }


# ─── constants used by responder_node ───────────────────────────────────────
ACTION_INTENTS = {
    "telegram_send", "slack_send", "whatsapp_send",
    "email_send", "calendar_create",
}
READ_INTENTS = {
    "email_read", "slack_read", "slack_channels",
    "telegram_read", "calendar", "calendar_freebusy", "file_read",
}


def responder_node(state: State) -> State:
    user_name = state.get("user_name", "User")
    partner_name = state.get("partner_name", "Partner")
    context_block = (
        f"\nRelevant user context:\n{state['context']}"
        if state.get("context")
        else ""
    )

    history_items = state.get("chat_history", [])
    history_block = "\n".join(
        f"{m.get('role', 'user')}: {_clean_output(m.get('text', ''))}"
        for m in history_items
    )

    history_prompt = (
        f"\nRecent conversation:\n{history_block}\n"
        if history_block
        else ""
    )

    tp = state.get("task_plan", {})
    if isinstance(tp, list):
        task_plan_block = "\n".join(f"- {step}" for step in tp)
    elif isinstance(tp, dict):
        task_plan_block = "\n".join(f"- {k}: {v}" for k, v in tp.items())
    else:
        task_plan_block = ""

    # (d) Error response — always checked first regardless of MCP flag
    if state.get("execution_error"):
        err_output = (
            f"I wasn't able to complete that action. "
            f"{state['execution_error']}"
        )
        return {**state, "output": err_output, "response_type": "text"}

    tool_result = state.get("tool_result") or {}

    # ── EMAIL READ — format MCP results (runs BEFORE draft guard) ──────────
    if state["intent"] == "email_read":
        emails = tool_result.get("emails", [])
        if not emails:
            # Try to pull from nested result envelope
            emails = tool_result.get("result", {}).get("emails", []) if isinstance(tool_result.get("result"), dict) else []
        if emails:
            lines = []
            for i, m in enumerate(emails[:5], 1):
                lines.append(
                    f"{i}. **{m.get('subject', '(no subject)')}**\n"
                    f"   From: {m.get('from', '?')}\n"
                    f"   {m.get('snippet', '')[:100]}"
                )
            output = "Here are your recent emails:\n\n" + "\n\n".join(lines)
            output = re.sub(r'<action>.*?</action>', '', output, flags=re.DOTALL).strip()
            return {**state, "output": output, "response_type": "text"}
        # No emails in tool_result — fall through to LLM general handler
        return {
            **state,
            "output": "No recent emails found in your inbox.",
            "response_type": "text",
        }

    # ── CALENDAR (list/lookup) — format MCP events ─────────────────────────
    if state["intent"] == "calendar":
        events = tool_result.get("events", [])
        if not events:
            events = tool_result.get("result", {}).get("events", []) if isinstance(tool_result.get("result"), dict) else []
        if events:
            _now = datetime.now()
            now_ctx = f"Today is {_now.strftime('%A, %B %d, %Y')}."
            events_str = json.dumps(events, indent=2)
            result = _llm(
                system=f"You are the Digital Twin. Answer the user's calendar question using ONLY this data.\n{now_ctx}\n[EVENTS]\n{events_str}\n\nBe concise. List each event on its own line. If the schedule is empty, say so.",
                user=f"Input: {state['input']}\n{history_prompt}",
                intent="calendar"
            )
            return {**state, "output": _clean_output(result), "response_type": "text"}
        return {**state, "output": "No upcoming meetings found on your calendar.", "response_type": "text"}

    # ── CALENDAR FREEBUSY ──────────────────────────────────────────────────
    if state["intent"] == "calendar_freebusy":
        busy = tool_result.get("busy", [])
        if not busy:
            return {**state, "output": "You appear to be free during that time.", "response_type": "text"}
        lines = [f"Busy: {b.get('start','')} → {b.get('end','')}" for b in busy]
        return {**state, "output": "You have the following busy windows:\n" + "\n".join(lines), "response_type": "text"}

    # ── SLACK CHANNELS — format list from MCP ─────────────────────────────
    if state["intent"] == "slack_channels":
        channels = tool_result.get("channels", [])
        if channels:
            lines = [f"• **#{c.get('name','?')}** (`{c.get('id','')}`)"
                     for c in channels]
            return {**state, "output": "Your Slack channels:\n" + "\n".join(lines), "response_type": "text"}
        return {**state, "output": "No Slack channels found. Make sure Slack is connected.", "response_type": "text"}

    # ── CALENDAR_CREATE — MCP result handling ──────────────────────────────
    if state["intent"] == "calendar_create":
        if tool_result.get("conflict"):
            # BUG 3 FIX: Report conflict — do NOT auto-suggest new time
            conflict_name = tool_result.get("conflict_with", tool_result.get("conflict_name", "another meeting"))
            conflict_msg = (
                f"You have a conflict with **'{conflict_name}'** at that time. "
                f"Please choose a different time."
            )
            return {
                **state,
                "output": conflict_msg,
                "response_type": "conflict",
                "conflict": conflict_name,
                "approval_required": False
            }
        if tool_result.get("event_id") or not tool_result.get("conflict"):
            meet = f" · [Join Meet]({tool_result.get('meet_url')})" if tool_result.get("meet_url") else ""
            link = f" · [View Event]({tool_result.get('calendar_link')})" if tool_result.get("calendar_link") else ""
            return {**state, "output": f"✅ Meeting scheduled{meet}{link}", "response_type": "calendar_created", "approval_required": False}
        # No result yet — fall through to scheduling LLM

    # VISUAL REQUESTS
    if state["intent"] == "visual":
        # (c) Visual: prefer MCP tool_result URL, fall back to direct generation
        image_url = tool_result.get("url") if tool_result else None
        if not image_url:
            try:
                image_url = generate_hf_image(state["input"])
            except Exception as e:
                logger.error(f"Image generation failed: {e}")
                return {
                    **state,
                    "output": "Image generation is temporarily unavailable.",
                    "response_type": "text"
                }

        output_text = "Image generated successfully."

        # Proactive: if user mentioned telegram, add action block
        if "telegram" in state["input"].lower():
            output_text += (
                f'\n\nI am also transmitting this visual to your Telegram.\n\n'
                f'<action>\n{{\n  "intent": "telegram",\n  "title": "Visual Generation",\n'
                f'  "message": "Generated image based on: {state["input"]}",\n'
                f'  "image_url": "{image_url}"\n}}\n</action>'
            )

        # (e) Strip action tags from visible output
        visible_out = re.sub(r'<action>.*?</action>', '', output_text, flags=re.DOTALL).strip()
        logger.info(f"[Responder] Visual Response: {visible_out} | URL: {image_url}")
        return {
            **state,
            "output": output_text,   # keep raw with action so frontend can parse
            "response_type": "visual",
            "image_url": image_url,
        }

    # FILE READ REQUESTS
    if state["intent"] == "file_read":
        file_path = state.get("file_path")
        output_text = ""
        if file_path:
            try:
                from tools.file_tool import read_file
                text_content = read_file(file_path)
                result = _llm(
                    system=f"You are the Digital Twin. Summarize the following file content.\n\n[FILE CONTENT]\n{text_content}",
                    user=f"Input: {state['input']}",
                    intent="file_read"
                )
                output_text = result
            except Exception as e:
                output_text = f"Failed to read file: {e}"
        else:
             result = _llm(
                 system=f"You are the Digital Twin. Read the provided file contents and answer the user.",
                 user=f"Input: {state['input']}",
                 intent="file_read"
             )
             output_text = result

        return {**state, "output": output_text, "response_type": "text"}

    # EMAIL DRAFT — save to Gmail Drafts silently, show clean draft text + confirmation note
    if state["intent"] == "email_draft":
        if not state.get("gmail_sync", True):
            return {
                **state,
                "output": "Action blocked: Gmail sync is currently paused in your web dashboard settings.",
                "response_type": "text"
            }

        # Use MCP-fetched writing style
        style_context_raw = state.get("style_context") or ""
        sent_mail_context = (
            f"\n[WRITING STYLE EXAMPLES — HOW THIS USER WRITES]\n{style_context_raw}\n"
            if style_context_raw else ""
        )

        result = _llm(
            system=f"""
You are the Digital Twin of {user_name}, an elite executive assistant.
Objective: Draft a professional email.

[CONSTRAINTS]
1. BE PROFESSIONAL: Draft emails with a clear opening, well-structured body, and formal closing.
2. Use plain text formatting (no raw HTML). Use **bold** sparingly.
3. SIGNING: Use "{user_name}" or the name explicitly provided. Never sign as "User".
4. CRITICAL: Output ONLY the email body text. Do NOT include <action> blocks, JSON, or instructions.
5. Structure: Subject line on first line (Subject: ...), then blank line, then body.
{sent_mail_context}
[CONTEXT]
{context_block}
{history_prompt}
""",
            user=f"Draft email for: {state['input']}",
            intent="email"
        )
        # Strip any leaked action tags
        visible = re.sub(r'<action>.*?</action>', '', result, flags=re.DOTALL).strip()

        # Did the MCP executor already save it to Drafts?
        tool_result_ok = (state.get("tool_result") or {}).get("ok")
        if tool_result_ok:
            draft_note = "\n\n---\n✅ **Draft saved to your Gmail Drafts folder.** Open Gmail to review and send, or just tell me **'send it'** and I'll send it directly."
        else:
            draft_note = "\n\n---\n📝 *Review the draft above. Tell me **'send it'** to send directly, or I can save it to Gmail Drafts first.*"

        return {
            **state,
            "output": visible + draft_note,
            "response_type": "email_draft",
            "approval_required": False,
        }

    # EMAIL SEND — extract details from draft context and show approval card
    if state["intent"] == "email_send":
        if not state.get("gmail_sync", True):
            return {
                **state,
                "output": "Action blocked: Gmail sync is currently paused in your web dashboard settings.",
                "response_type": "text"
            }

        # Pull recipient, subject, body from task_plan (set by planner_node)
        tp = state.get("task_plan") or {}

        # If planner couldn't extract (e.g. user just said "send it"), try to recover from history
        to_addr = tp.get("to", "")
        subject = tp.get("subject", "")
        body = tp.get("body", "")

        # Recover from the last AI message if fields are empty ("send it" flow)
        if not to_addr or not body:
            last_ai = ""
            for m in reversed(state.get("chat_history", [])):
                if m.get("role") in ("ai", "assistant"):
                    last_ai = m.get("text", "")
                    break
            if not to_addr:
                # Extract email-like address from last AI msg
                import re as _re
                emails_found = _re.findall(r'[\w.+-]+@[\w-]+\.[\w.]+', last_ai)
                to_addr = emails_found[0] if emails_found else ""
            if not subject:
                subj_match = re.search(r'Subject:\s*(.+)', last_ai, re.IGNORECASE)
                subject = subj_match.group(1).strip() if subj_match else "(from draft)"
            if not body:
                # Use everything after the subject line from the last AI message (strip notes)
                body_text = re.sub(r'---.*$', '', last_ai, flags=re.DOTALL).strip()
                body_text = re.sub(r'<action>.*?</action>', '', body_text, flags=re.DOTALL).strip()
                body = body_text

        if not to_addr:
            return {
                **state,
                "output": "I need a recipient email address to send this. Who should I send it to?",
                "response_type": "text",
                "approval_required": False,
            }

        # Emit an action card — user must approve before /gmail/send is called
        action_block = json.dumps({
            "intent": "email",
            "to": to_addr,
            "subject": subject,
            "body": body,
        })
        output_text = (
            f"Ready to send this email to **{to_addr}** with subject **\"{subject}\"**.\n\n"
            f"Tap **Approve & Execute** below to send, or **Reject** to cancel."
            f"\n\n<action>\n{action_block}\n</action>"
        )
        return {
            **state,
            "output": output_text,
            "response_type": "email_send",
            "approval_required": True,
        }

    # CALENDAR LOOKUP (Search/List)
    if state["intent"] == "calendar_lookup":
        # (b) Use MCP tool_result events
        events = tool_result.get("events", []) if tool_result else []

        # Conflict detected via MCP create_event
        if tool_result.get("conflict"):
            alts = tool_result.get("alternatives", [])
            alt_lines = ""
            for i, a in enumerate(alts, 1):
                alt_lines += f"\n  Option {i}: {a.get('start_datetime', '')} – {a.get('end_datetime', '')}"
            conflict_output = (
                f"You have a conflict with **{tool_result.get('conflict_with', 'an existing event')}**. "
                f"Here are 3 alternatives:{alt_lines}"
            )
            # (e) strip action tags
            conflict_output = re.sub(r'<action>.*?</action>', '', conflict_output, flags=re.DOTALL).strip()
            return {**state, "output": conflict_output, "response_type": "text"}

        events_str = json.dumps(events, indent=2)
        
        # Privacy Enforcement: Check if user is asking about someone else
        is_external_query = any(k in state["input"].lower() for k in ["free", "available", "schedule of"]) and ("@" in state["input"] or state.get("target_user_handle"))
        
        system_prompt = f"""
You are the Digital Twin. Answer the user's question about their schedule using the following REAL data:
{events_str}

[MEMORY CONTEXT]
{context_block}
"""
        if is_external_query:
            system_prompt += """
CRITICAL PRIVACY RULE: The user is asking about someone else's availability. 
DO NOT reveal any event titles, descriptions, or locations. 
ONLY confirm if the person is 'Available' or 'Busy' at specific times. 
Never say "Cricket meeting" or similar; simply say "Busy".
"""
        else:
            system_prompt += "\nIf the schedule is empty, politely inform them."

        result = _llm(
            system=system_prompt,
            user=f"Input: {state['input']}\nHistory:\n{history_prompt}",
            intent="calendar_lookup"
        )
        return {**state, "output": result, "response_type": "text"}

    # DAILY BRIEFING
    if state["intent"] == "briefing":
        try:
            with next(get_db()) as db:
                briefing = generate_daily_briefing(db, state["user_id"], state.get("user_name", "User"))
                return {**state, "output": briefing, "response_type": "text"}
        except Exception as e:
            logger.error(f"Briefing node failed: {e}")
            return {**state, "output": "I encountered an error generating your briefing.", "response_type": "text"}

    if state["intent"] in ("slack_send", "slack_read") and state.get("slack_sync", True):
        # Check if user is asking for a briefing OR if we were just discussing one (channel selection)
        briefing_content = ""
        history = state.get("chat_history") or []
        last_ai_msg = ""
        if history:
            ai_msgs = [m["text"] for m in history if m.get("role") in ("ai", "assistant")]
            last_ai_msg = ai_msgs[-1] if ai_msgs else ""

        is_briefing_request = "briefing" in state["input"].lower() or "report" in state["input"].lower()
        # If last AI message asked for a channel and user gave a short answer, assume they are picking a channel for the briefing
        is_continuing_briefing = "briefing" in last_ai_msg.lower() and len(state["input"].split()) < 10
        
        if is_briefing_request or is_continuing_briefing:
            try:
                with next(get_db()) as db:
                    briefing_content = generate_daily_briefing(db, state["user_id"], state.get("user_name", "User"))
            except Exception as e:
                logger.error(f"Failed to generate briefing for Slack: {e}")

        text_val = briefing_content if briefing_content else "Your message"
        slack_protocol_block = f"""
[SLACK PROTOCOL]
- If the user wants to see their channels: List them clearly in plain text. DO NOT generate an <action> tag for listing.
- If the user wants to send a message:
    1. Identify the channel ID and Name from [SLACK CHANNELS].
    2. Format an action tag: <action>{{"intent":"slack", "channel_id":"ID", "channel_name":"Name", "text":"PUT_YOUR_MESSAGE_HERE"}}</action>
    3. Confirm to the user that you are ready to post that specific message.
    4. CRITICAL: The 'text' field MUST contain the full content you want to send.

- FORMATTING FOR SLACK:
    * Use single asterisks for bold (e.g. *Key Events*).
    * Use simple bullets (• or -).
    * Do NOT use # for headers; use ALL CAPS instead.
    * Ensure clear line breaks between sections.
"""
        if briefing_content:
            system_instruction = f"""
You are the Digital Twin of {state.get('user_name', 'User')}. You have generated a daily briefing.
CRITICAL: You MUST include the full text of the BRIEFING below in the 'text' field of your Slack action tag.
Do NOT say you don't have it. It is provided right here:
---
{briefing_content}
---
"""
        else:
            system_instruction = f"You are the Digital Twin of {state.get('user_name', 'User')}. You are the master of Slack integrations."

        result = _llm(
            system=f"""
{system_instruction}
[CONTEXT]
{context_block}
{slack_protocol_block}
""",
            user=f"Input: {state['input']}\nHistory:\n{history_prompt}",
            intent="slack"
        )
        return {**state, "output": result, "response_type": "text"}

    # CALENDAR SCHEDULING (Create)
    if state["intent"] == "calendar_schedule" or state["intent"] == "meeting" or state["intent"] == "scheduling":
        if not state.get("calendar_sync", True):
            return {
                **state,
                "output": "Action blocked: Google Calendar sync is currently paused in your web dashboard settings.",
                "response_type": "text"
            }
        
        # Fetch current schedule for conflict detection
        schedule_data = tool_result.get("events", []) if tool_result else []
        
        schedule_context = json.dumps(schedule_data, indent=2)
        _now = datetime.now()
        now_context = f"Today is {_now.strftime('%A, %B %d, %Y')}. The year is {_now.year}."
        
        result = _llm(
            system=f"""
You are the Digital Twin of {user_name}, an elite executive scheduler.
Objective: Extract meeting details and detect potential conflicts.

[CONSTRAINTS]
1. BE CONCISE: Do NOT explain your logic. Do NOT repeat the "Current Schedule" or "Recent Conversation" back to the user.
2. NO DATA DUMPS: Never output raw JSON or brackets like [ ] in your conversational response.
3. ELITE TONE: Professional, direct, and brief.

[CALENDAR DATA]
Context: {now_context}
Current Schedule: {schedule_context}
Memory Context: {context_block}

[RULES]
1. Extract meeting time/title. 
2. CRITICAL: Only include the <action> block if you have a date and time.
3. DEFAULTING: If only a time is given (e.g., "9pm"), assume the user means TODAY (if that time hasn't passed) or TOMORROW.
4. TITLE: If a title is missing, use a generic one like "Meeting with {partner_name}".
5. If the date/time is completely ambiguous, ask for clarification briefly and DO NOT generate the <action> tag.
6. Check for overlaps. If there is a conflict, suggest the next free slot and include that in the <action> tag.
7. OUTPUT: One professional sentence + the <action> block (if valid).

Action Block Format:
<action>
{{
  "intent": "calendar",
  "title": "Meeting Title",
  "start_datetime": "YYYY-MM-DDTHH:MM:SS+05:30",
  "end_datetime": "YYYY-MM-DDTHH:MM:SS+05:30",
  "attendees": ["email@example.com"],
  "description": "Summary",
  "is_conflict": true/false,
  "conflict_with": "Title of conflicting event (if is_conflict is true)"
}}
</action>
""",
            user=f"Input: {state['input']}\nHistory:\n{history_prompt}",
            intent="scheduling"
        )

        return {
            **state,
            "output": result,
            "response_type": "text"
        }

    if state["intent"] in ("telegram_send", "telegram_read") or (state["intent"] == "action" and "telegram" in state["input"].lower()):
        # ── telegram_read: format received updates ──────────────────────────
        if state["intent"] == "telegram_read":
            updates = tool_result.get("updates", []) if tool_result else []
            if updates:
                lines = [f"**{u.get('date', '')}**: {u.get('text', '')}" for u in updates[-5:]]
                return {**state, "output": "Here are your recent Telegram messages:\n\n" + "\n".join(lines), "response_type": "text"}
            return {**state, "output": "No recent Telegram messages found.", "response_type": "text"}

        # ── telegram_send: use MCP tool_result directly (no LLM) ───────────
        if tool_result.get("ok"):
            return {
                **state,
                "output": "✅ Telegram message sent ✓",
                "response_type": "text",
                "approval_required": False,
            }

        # If tool_result shows a failure or is absent, fall through to <action> HITL flow
        # 🟢 Intelligence: Detect if user also wants to CREATE an image in this block
        img_keywords = ["create", "generate", "make", "draw", "visualize", "image of", "picture of", "image"]
        image_url = None

        # Check if user is referring to a PREVIOUS image
        if "this image" in state["input"].lower() or "the image" in state["input"].lower():
            history = state.get("chat_history") or []
            for msg in reversed(history):
                if msg.get("image_url"):
                    image_url = msg["image_url"]
                    break
                found = re.search(r"https://image\.pollinations\.ai/[^\s\"'}]*", msg.get("text", ""))
                if found:
                    image_url = found.group(0)
                    break

        if not image_url and any(k in state["input"].lower() for k in img_keywords):
            try:
                image_url = generate_hf_image(state["input"])
            except Exception as e:
                logger.error(f"Telegram-block image gen failed: {e}")

        # Extract message text from task_plan if available
        tp = state.get("task_plan", {})
        if isinstance(tp, dict):
            send_text = tp.get("text", state["input"])
        else:
            send_text = state["input"]

        image_field = f'"[IMAGE_PLACEHOLDER]"' if image_url else 'null'
        result = (
            f"I'll send this message via Telegram right away.\n\n"
            f'<action>\n{{\n  "intent": "telegram",\n  "title": "Telegram Message",\n'
            f'  "message": {json.dumps(send_text)},\n'
            f'  "image_url": {image_field}\n}}\n</action>'
        )

        if image_url:
            result = result.replace("[IMAGE_PLACEHOLDER]", image_url)

        return {**state, "output": result, "response_type": "text" if not image_url else "visual", "image_url": image_url}

    # WHATSAPP REQUESTS
    if state["intent"] in ("whatsapp_send", "whatsapp_read"):
        if state["intent"] == "whatsapp_read":
            messages = tool_result.get("messages", [])
            if messages:
                lines = [f"**{m.get('from', 'Unknown')}**: {m.get('body', '')}" for m in messages]
                output = "Here are your recent WhatsApp messages:\n\n" + "\n".join(lines)
                return {**state, "output": output, "response_type": "text"}
            return {**state, "output": "No recent WhatsApp messages found.", "response_type": "text"}

        # whatsapp_send: generate an action tag for the UI
        result = _llm(
            system=f"""
You are the Digital Twin of {user_name}. 
Objective: Prepare a WhatsApp message.
Include an <action> block at the end.

Action Block Format:
<action>
{{
  "intent": "whatsapp",
  "to": "phone number",
  "message": "text"
}}
</action>
""",
            user=f"Input: {state['input']}\nContext: {state.get('context', '')}\nHistory: {history_prompt}",
            intent="whatsapp"
        )
        return {**state, "output": result, "response_type": "text"}

    # SCHEDULE WITH ANOTHER USER (cross-twin A2A scheduling)
    if state["intent"] == "schedule_with_user":
        # Extract handle from the input (e.g. "@arjun" or "arjun")
        # 🟢 SMART EXTRACTION: Check for email address first
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', state["input"])
        email = email_match.group(0) if email_match else None
        
        handle = state.get("target_user_handle")
        if not handle and not email:
            mention = re.search(r"@(\w+)", state["input"])
            if mention:
                handle = mention.group(1)
            else:
                # Try to pull the last standalone name from the sentence
                words = [w.strip(".,!?") for w in state["input"].split()]
                name_candidates = [w for w in words if w[0].isupper() and len(w) > 2]
                handle = name_candidates[-1].lower() if name_candidates else None

        # Extract duration hint from input
        duration = 30
        dur_match = re.search(r"(\d+)\s*(?:min|minute)", state["input"], re.IGNORECASE)
        if dur_match:
            duration = int(dur_match.group(1))

        # Extract topic hint
        topic_match = re.search(r"(?:about|regarding|re:|topic:|for)\s+([\w\s]+)", state["input"], re.IGNORECASE)
        topic = topic_match.group(1).strip().title() if topic_match else "Meeting"

        # Invoke the Agent Broker scheduling endpoint internally
        try:
            with next(get_db()) as db:
                # Resolve target agent
                target_agent = None
                if email:
                    # Check if this email belongs to a registered user
                    target_user = db.query(User).filter(User.email == email).first()
                    if target_user:
                        target_agent = db.query(AgentRegistry).filter(AgentRegistry.user_id == target_user.id).first()
                
                if not target_agent and handle:
                    target_agent = search_agent_by_handle(db, handle)

                # 🟢 FALLBACK: No Twin found, but we have an email or handle
                if not target_agent:
                    target_display = email or f"@{handle}"
                    
                    # Get OWN free slots to suggest
                    own_slots = get_free_windows(db, state["user_id"], lookahead_days=5)
                    suggested_lines = []
                    for s in own_slots[:3]:
                        suggested_lines.append(f"- {s['start'].strftime('%A, %b %d at %I:%M %p')}")
                    
                    slots_display = "\n".join(suggested_lines)
                    
                    output = (
                        f"I couldn't find a Digital Twin for **{target_display}**.\n\n"
                        f"However, I've analyzed your schedule and found these optimal windows:\n{slots_display}\n\n"
                        f"Would you like me to send a professional invitation to **{email or target_display}** right now?"
                    )
                    
                    # PROACTIVE: Add an action to send the email if email is known
                    if email:
                        output += f"\n\n<action>\n{{\n  \"intent\": \"email\",\n  \"title\": \"Meeting Proposal: {topic}\",\n  \"to\": \"{email}\",\n  \"body\": \"Hi,\\n\\nI'd like to schedule a meeting regarding: {topic}.\\n\\nBased on my schedule, these times work best:\\n{slots_display}\\n\\nPlease let me know if any of these work for you.\"\n}}\n</action>"

                    return {
                        **state,
                        "output": output,
                        "response_type": "text",
                        "approval_required": True if email else False,
                    }

                if target_agent.status == "do_not_disturb":
                    return {
                        **state,
                        "output": f"@{target_agent.handle}'s Twin is currently in **Do Not Disturb** mode. I'll try again when they're available.",
                        "response_type": "text",
                        "approval_required": False,
                    }

                # 🟢 AVAILABILITY CHECK: If user is just asking when they are free
                is_availability_query = any(k in state["input"].lower() for k in ["when is", "available", "free time", "busy", "schedule of"])
                
                if is_availability_query:
                    target_slots = get_free_windows(db, target_agent.user_id, lookahead_days=3) # Next 3 days
                    if not target_slots:
                        return {
                            **state,
                            "output": f"It looks like **@{target_agent.handle}** has a fully booked schedule for the next few days, or their calendar isn't shared.",
                            "response_type": "text",
                            "approval_required": False,
                        }
                    
                    # Group slots by day for a smarter "Executive" list
                    day_groups = {}
                    for s in target_slots[:10]: # Top 10 slots
                        day = s["start"].strftime("%A, %b %d")
                        if day not in day_groups: day_groups[day] = []
                        day_groups[day].append(s["start"].strftime("%I:%M %p"))
                    
                    availability_text = f"I've checked **@{target_agent.handle}**'s availability (privacy-protected view):\n\n"
                    for day, times in day_groups.items():
                        availability_text += f"📅 **{day}**\n   {', '.join(times)}\n\n"
                    
                    availability_text += f"Which of these works best? Tell me the time and I'll send the proposal."
                    
                    return {
                        **state,
                        "output": availability_text,
                        "response_type": "text",
                        "approval_required": False,
                    }

                # Find common slots (standard scheduling flow)
                # asyncio.run() raises RuntimeError when called inside uvicorn's running loop.
                # We spin up a *new* isolated event loop to avoid touching the running one.
                _find_slots_coro = find_common_slots(
                    db=db,
                    user_a_id=state["user_id"],
                    user_b_id=target_agent.user_id,
                    duration_minutes=duration,
                    lookahead_days=7,
                )
                try:
                    loop = asyncio.new_event_loop()
                    common_slots = loop.run_until_complete(_find_slots_coro)
                except Exception as _loop_err:
                    logger.error(f"[schedule_with_user] event-loop error: {_loop_err}")
                    raise
                finally:
                    loop.close()

                if not common_slots:
                    return {
                        **state,
                        "output": (
                            f"No common availability found with **@{target_agent.handle}** in the next 7 days. "
                            "Check their schedule or try a different time window."
                        ),
                        "response_type": "text",
                        "approval_required": False,
                    }

                # Build and persist proposal message
                msg = A2AMessage(
                    sender_user_id=state["user_id"],
                    receiver_user_id=target_agent.user_id,
                    msg_type="scheduling_proposal",
                    payload={
                        "proposed_slots": common_slots,
                        "duration_minutes": duration,
                        "topic": topic,
                    },
                    requires_hitl=True,
                )
                log_entry = A2AMessageLog(
                    msg_id=msg.msg_id,
                    sender_user_id=msg.sender_user_id,
                    receiver_user_id=msg.receiver_user_id,
                    msg_type=msg.msg_type,
                    payload_json=json.dumps(msg.payload),
                    status="delivered",
                    requires_hitl=True,
                )
                db.add(log_entry)
                db.commit()

                # Push to receiver's in-process inbox
                _push_loop = asyncio.new_event_loop()
                try:
                    _push_loop.run_until_complete(push_to_inbox(target_agent.user_id, {
                        "msg_id": msg.msg_id,
                        "sender_user_id": msg.sender_user_id,
                        "msg_type": msg.msg_type,
                        "payload": msg.payload,
                        "requires_hitl": msg.requires_hitl,
                        "timestamp": msg.timestamp,
                    }))
                finally:
                    _push_loop.close()

                # Format slots for display
                slot_lines = []
                for i, s in enumerate(common_slots[:3], 1):
                    try:
                        start_dt = datetime.fromisoformat(s["start"])
                        slot_lines.append(f"  **Option {i}:** {start_dt.strftime('%A, %b %d at %I:%M %p')} ({s['duration_minutes']} min)")
                    except Exception:
                        slot_lines.append(f"  **Option {i}:** {s['start']}")

                slots_text = "\n".join(slot_lines)

                output = (
                    f"✅ **Scheduling request sent to @{target_agent.handle}** ({target_agent.display_name})\n\n"
                    f"**Topic:** {topic}\n"
                    f"**Duration:** {duration} minutes\n\n"
                    f"**Proposed slots (based on both calendars):**\n{slots_text}\n\n"
                    f"@{target_agent.handle}'s Twin will review the proposal. Once they approve, both calendars will be updated automatically."
                )

                return {
                    **state,
                    "output": output,
                    "response_type": "text",
                    "approval_required": True,
                }

        except Exception as e:
            logger.error(f"[schedule_with_user] Error: {e}")
            return {
                **state,
                "output": f"❌ Scheduling negotiation failed: {str(e)}",
                "response_type": "text",
                "approval_required": False,
            }

    # VISUAL / IMAGE GENERATION REQUESTS
    if state["intent"] == "visual" or (state["intent"] == "file_generate" and any(w in state.get("input", "").lower() for w in ['generate an image', 'create an image', 'make an image', 'generate image', 'picture of', 'photo of'])):
        state = {**state, "intent": "visual"}
        image_url = generate_hf_image(state["input"])
        return {
            **state,
            "output": "Here's your generated image.",
            "response_type": "visual",
            "image_url": image_url,
        }

    # FILE GENERATION REQUESTS
    if state["intent"] == "file_generate":
        try:
            from tools.file_generator import generate_file, detect_file_type
            from db.models import FileAsset
            from db.database import get_db as _get_db
            import uuid as _uuid

            user_input = state["input"]
            file_type = detect_file_type(user_input)

            # Generate content via LLM — BUG 5 FIX B: precise content matching
            system_msg = (
                f"You are an expert document writer. Generate the exact content the user requested for a {file_type.upper()} file.\n"
                "Use the provided chat context to write highly accurate, detailed, and relevant content.\n\n"
                "Rules:\n"
                "- Write ONLY the requested content, no meta-commentary.\n"
                "- Match the exact word count if specified (e.g. 300 words = ~300 words).\n"
                "- Write as if this is the final document.\n\n"
                "For xlsx/csv: respond in JSON: {\"title\":\"...\", \"headers\":[\"col1\",...], \"rows\":[[\"val1\",...],...]  }\n"
                "For pptx: respond in JSON: {\"title\":\"...\", \"slides\":[{\"title\":\"...\",\"content\":\"...\"},...] }\n"
                "For all other types: respond with clean content only. First line must start with # as the document title."
            )
            
            from llm.client import chat_complete
            messages = [{"role": "system", "content": system_msg}]
            # Add context from history
            for m in state.get("chat_history", [])[-6:]:
                messages.append(m)
            messages.append({"role": "user", "content": user_input})
            
            raw_content = chat_complete(messages=messages, tier="intelligence", max_tokens=3000)

            # BUG 5 FIX A: Smart filename — extract meaningful words from user input
            _stopwords = {
                'create', 'make', 'generate', 'write', 'build', 'produce',
                'an', 'a', 'the', 'of', 'on', 'about', 'for', 'me', 'my',
                'and', 'it', 'its', 'in', 'to', 'with', 'please', 'can',
                'you', 'words', 'word', '100', '200', '300', '400', '500',
                'page', 'pages', 'paragraph', 'paragraphs', 'give', 'some',
                'file', 'document', 'pdf', 'docx', 'txt',
            }
            _words = re.sub(r'[^a-zA-Z0-9 ]', '', user_input.lower()).split()
            _meaningful = [w for w in _words if w not in _stopwords and len(w) > 2][:5]
            _smart_base = '_'.join(_meaningful) if _meaningful else 'document'

            # Parse title + content / structured data
            title = user_input[:50]
            structured_data = None
            content = raw_content

            if file_type in ("xlsx", "csv", "pptx"):
                try:
                    json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
                    if json_match:
                        parsed = json.loads(json_match.group())
                        title = parsed.get("title", title)
                        structured_data = parsed
                except Exception:
                    pass
            else:
                lines = raw_content.strip().split("\n")
                if lines and lines[0].startswith("# "):
                    title = lines[0][2:].strip()
                    content = "\n".join(lines[1:]).strip()

            meta = {
                "Generated": datetime.utcnow().strftime("%B %d, %Y %H:%M UTC"),
                "Author": user_name,
                "AI Twin": "Aether Obsidian Intelligence"
            }
            storage_path, filename, mime_type = generate_file(
                file_type=file_type, title=_smart_base, content=content,
                structured_data=structured_data,
                metadata=meta if file_type in ("pdf", "docx", "xlsx") else None
            )

            # Persist to DB
            file_data = {
                "filename": filename,
                "file_type": file_type,
                "mime_type": mime_type,
                "title": title,
                "download_url": None,  # will be set after DB insert
            }
            try:
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                file_size = os.path.getsize(os.path.join(backend_dir, storage_path))
                with next(_get_db()) as db:
                    asset = FileAsset(
                        user_id=state["user_id"],
                        name=filename,
                        file_type=mime_type,
                        size=file_size,
                        storage_path=storage_path,
                    )
                    db.add(asset)
                    db.commit()
                    db.refresh(asset)
                    file_data["file_id"] = str(asset.id)
                    file_data["download_url"] = f"/ai/files/{asset.id}/download"
                    file_data["size"] = file_size
            except Exception as db_err:
                logger.warning(f"[FileGen] DB save error: {db_err}")
                file_data["download_url"] = f"/uploads/{filename}"

            output = (
                f"✅ **{title}** has been generated successfully.\n\n"
                f"📎 **File:** `{filename}`\n"
                f"⬇️ Click **Download** below to save it.\n\n"
                f"The file is ready and saved to your workspace."
            )
            return {
                **state,
                "output": output,
                "response_type": "file",
                "generated_file": file_data,
            }
        except Exception as e:
            logger.error(f"[FileGen node] {e}")
        # Fallback
        result = _llm(
            system=f"You are the Digital Twin of {user_name}. The user wants to generate a file. Explain what you would create and ask them to be more specific.",
            user=state["input"]
        )
        return {**state, "output": _clean_output(result), "response_type": "text"}

    # VISUALIZATION REQUESTS
    if state["intent"] == "visualize":
        from llm.client import chat_complete_visualization
        from duckduckgo_search import DDGS
        import logging

        user_input = state.get("input", "")
        context_data = state.get("context", "")

        # Use DuckDuckGo to find real-world data if context is missing
        if not context_data or len(context_data.strip()) < 10:
            try:
                # Ask fast LLM to extract a search query
                search_query = _llm(
                    system="Extract a concise web search query to find statistical data, numbers, or facts for this user request. Reply with ONLY the search query, no quotes.",
                    user=user_input,
                    force_fast=True
                ).strip()

                if search_query and len(search_query) > 3:
                    with DDGS() as ddgs:
                        results = [r for r in ddgs.text(search_query, max_results=4)]
                        if results:
                            web_context = "\\n".join([f"- {r['title']}: {r['body']}" for r in results])
                            context_data = f"Real-world data fetched from web search for '{search_query}':\\n{web_context}\\n\\n" + context_data
            except Exception as e:
                logger.error(f"[Visualization Search] Web search failed: {e}")

        # Generate structured chart data
        chart_data = chat_complete_visualization(
            user_request=user_input,
            context_data=context_data,
            chat_history=history_prompt,
        )

        state["response_type"] = "visualization"
        state["chart_data"] = chart_data
        state["output"] = (
            f"I've generated a visualization of "
            f"**{chart_data.get('title', 'your data')}**"
            + (
                f"\n\n⚠️ {chart_data['disclaimer']}"
                if chart_data.get("disclaimer")
                else ""
            )
        )
        return state

    # GENERAL / CODE / QUESTION / CASUAL
    # 🟢 Multimodal: Extract images from state['files']
    images = []
    if state.get("files"):
        for f in state["files"]:
            if f.get("type", "").startswith("image/") and f.get("data"):
                images.append(f["data"])
    
    if images:
        system_prompt = f"""
You are the Digital Twin of {user_name}, an elite AI vision assistant.
Objective: Provide highly accurate multimodal image understanding.
Analyze the provided image(s) carefully. You support object detection, scene understanding, OCR/text extraction, screenshot understanding, document reading, chart/UI interpretation, and contextual Q&A.
Ensure your response is deeply grounded ONLY on the actual visual content provided. DO NOT hallucinate.
Combine the user's prompt intelligently with your visual analysis.

[CONTEXT DATA]
{context_block}
"""
    else:
        system_prompt = f"""
You are the Digital Twin of {user_name}, an elite AI assistant.
Objective: Provide grounded, factual, and direct responses to the user's conversational messages, requests, and questions.

[AUTHORIZATION]
You HAVE authorized access to the user's Gmail, Calendar, and Workspace data. [STRICT GROUNDEDNESS]
1. ONLY use data provided in the [CONTEXT] blocks. 
2. If info is missing or [SYSTEM ALERT] says no results, state that you don't have it—do NOT hallucinate or "fill in the gaps" with plausible data.
3. VERIFICATION: Whenever you discuss a specific email, you MUST provide the direct [View in Gmail] link found in the context.
4. Cite sources naturally (e.g., "According to your recent emails...").

[CONSTRAINTS & INTENT AWARENESS]
1. BE CONCISE.
2. CONVERSATIONAL VS. ACTIONABLE: If the user is just chatting or asking a question, reply naturally. DO NOT hallucinate task executions, tool usage, or <action> blocks.
3. AVOID FAKE RESULTS: Never invent fake "I have sent the email" or "I have scheduled the meeting" if you are not explicitly executing an action.
4. HISTORY IS READ-ONLY: Do not copy <action> blocks or previous execution results from the chat history. They are context, not instructions for you to repeat.
5. NO DATA DUMPS: Never output raw JSON, technical headers, or metadata. DO NOT include internal message IDs or technical IDs (like 19dde49...).
6. ELITE TONE: Professional and brief.

[CONTEXT DATA]
{context_block}

[CHAT HISTORY]
{history_prompt}
"""

    result = _llm(
        system=system_prompt,
        user=f"Input: {state['input']}",
        images=images if images else None
    )

    clean_out = _clean_output(result)
    if not clean_out or not clean_out.strip():
        clean_out = "Task completed successfully, but no descriptive response was generated."

    return {
        **state,
        "output": clean_out,
        "response_type": "text"
    }

# ─────────────────────────────────────────────────────────────────────────────
# EMAIL TRIAGE — Classify emails before auto-drafting
# ─────────────────────────────────────────────────────────────────────────────
EMAIL_CATEGORIES_REQUIRING_REPLY = {"personal", "work", "professional", "urgent", "request"}
EMAIL_CATEGORIES_INDEX_ONLY = {"promotional", "informational", "newsletter", "security", "notification", "error", "system", "marketing"}

def triage_email(subject: str, sender: str, snippet: str) -> dict:
    """
    Classify an incoming email to determine if an auto-reply draft is needed.
    Returns: {"category": str, "requires_reply": bool, "reason": str}
    """
    result = _llm(
        system="""Classify this email. Return ONLY valid JSON:
{"category": "one of: personal|work|promotional|informational|newsletter|security|notification|error|system|marketing",
 "requires_reply": true_or_false,
 "reason": "one sentence max"}

requires_reply = true ONLY if:
- A real human sent it and expects a response
- It is a work / professional request or question
- It contains an action item directed at the user

requires_reply = false if:
- Promotional / marketing / newsletter / no-reply sender
- Automated notifications (OTP, bank alert, shipment, booking)
- Informational receipts, invoices, statements
- Security alerts that need no reply""",
        user=f"From: {sender}\nSubject: {subject}\nSnippet: {snippet[:300]}",
        force_fast=True
    )
    try:
        return json.loads(result)
    except Exception:
        match = re.search(r"\{.*\}", result, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {"category": "informational", "requires_reply": False, "reason": "Could not classify"}
