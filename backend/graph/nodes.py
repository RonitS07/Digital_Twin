import os
import json
import re
import requests
import base64
import logging
import asyncio
from datetime import datetime
from groq import Groq
from graph.state import State
from memory.chroma import retrieve_memory
from tools.gmail_tool import get_email_details, read_recent_emails, search_emails
from tools.calendar_tool import get_upcoming_events
from tools.slack_tool import list_slack_channels
from db.database import get_db
from db.models import A2AMessageLog, User, AgentRegistry
from services.agent_registry import search_agent_by_handle, push_to_inbox
from services.scheduling_negotiation import find_common_slots, get_free_windows
from schemas.a2a_message import A2AMessage
from utils.briefing import generate_daily_briefing

logger = logging.getLogger(__name__)

from graph.llm_utils import _llm

def generate_hf_image(prompt: str) -> str:
    import urllib.parse
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=768&model=flux&nologo=true"

    # Return the direct URL for browser-side loading (more reliable than huge base64 strings)
    return url

def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{.*\}", text, re.DOTALL)
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
        if "briefing" in last_ai_msg: return {**state, "intent": "slack"}
        if any(k in last_ai_msg for k in ["schedule", "meeting", "calendar", "invite", "slot"]): 
            return {**state, "intent": "scheduling"}

    # Scheduling / Calendar (check BEFORE email — "invite" should route here)
    if any(k in user_input for k in ["schedule", "meeting", "calendar", "event", "availability", "free slot", "book a", "set up a", "invite"]):
        return {**state, "intent": "scheduling"}

    # Gmail/Email — explicit email words
    if any(k in user_input for k in ["email", "mail", "gmail", "inbox"]):
        if any(k in user_input for k in ["search", "find", "show me", "read", "unread", "recent", "what did", "check", "promotion", "offer", "deal", "bank", "statement", "receipt", "invoice", "order", "shipping", "delivery", "who", "last", "latest", "when", "did"]):
            return {**state, "intent": "email_search"}
        return {**state, "intent": "email"}

    # Implicit email search — user asks about topics that live in their inbox (no 'email' keyword needed)
    implicit_search_triggers = [
        "laptop deal", "laptop promotion", "discount", "offer", "bank statement", "last statement",
        "receipt from", "order from", "invoice from", "shipping update", "delivery update",
        "flight booking", "hotel booking", "subscription", "renewal", "payment confirmation",
        "new offer", "sale on", "promo code", "coupon"
    ]
    if any(trigger in user_input for trigger in implicit_search_triggers):
        return {**state, "intent": "email_search"}

    # telegram / slack / email action prioritization
    if "telegram" in user_input:
        return {**state, "intent": "telegram"}
    if "slack" in user_input and "briefing" not in user_input:
        return {**state, "intent": "slack"}

    # Fallback to LLM for more complex classification
    result = _llm(
        system="""
You are a strict intent classifier for an AI Twin.
Your goal is to identify if the user wants an ACTION (sending/scheduling) or just an ANSWER.

CATEGORY DEFINITIONS:
1. 'visual': Generate a NEW image from text.
2. 'telegram': Send a message/image to Telegram.
3. 'slack': Send a message to Slack.
4. 'email': WRITING, DRAFTING, or SENDING a NEW email. (e.g. "Draft an email to...", "Write to...", "Send email to...")
5. 'calendar': Schedule or change a meeting.
6. 'calendar_lookup': Check or list schedule.
7. 'email_search': SEARCHING, CHECKING, or FINDING information in the inbox. (e.g. "Check my email for...", "Did I get a mail from...", "Show me my last emails...")
8. 'briefing': Daily summary of day.
9. 'question': General knowledge or asking about context.
10. 'casual': Chit-chat.

RULES:
- If the user wants to FIND an email, use 'email_search'.
- If the user wants to WRITE an email, use 'email'.
- If the user mentions 'telegram' or 'slack', ALWAYS choose that over 'question'.
- If the user asks for information AND to send it somewhere, choose the destination (telegram/slack/email).

Return ONLY valid JSON: {"intent":"category", "target_handle": "null_or_handle"}
""",
        user=state["input"],
    )
    parsed = _parse_json(result)
    intent = parsed.get("intent", "other")
    
    # Final override: if keywords are present, force the intent
    if "telegram" in user_input: intent = "telegram"
    if "slack" in user_input and intent == "question": intent = "slack"
    
    return {**state, "intent": intent, "target_user_handle": parsed.get("target_handle")}


def memory_node(state: State) -> State:
    # 1. Generate Contextual Search Query
    # If it's a short/ambiguous input, we use history to make it a better RAG query.
    history_context = ""
    if state.get("chat_history"):
        history_context = "\n".join([f"{m.get('role')}: {_clean_output(m.get('text', ''))}" for m in state["chat_history"][-3:]])
    
    query = state["input"]
    if len(query.split()) < 4 and history_context:
        query = _llm(
             system="Given the recent conversation, rephrase the user's latest message into a standalone, descriptive search query for a memory database. Output ONLY the query.",
             user=f"History:\n{history_context}\n\nLatest: {state['input']}"
        )
        logger.info(f"[Memory] Contextualized Query: {query}")

    chat_context = retrieve_memory(user_id=state["user_id"], query=query, type="chat")
    structured_context = retrieve_memory(user_id=state["user_id"], query=query, type="structured")

    context = ""
    if structured_context:
        context += "\n[LEARNED USER MEMORY]\n" + structured_context.strip() + "\n"
    if chat_context:
        context += "\n[RELEVANT CHAT MEMORY]\n" + chat_context.strip() + "\n"

    is_calendar_query = any(k in state["input"].lower() for k in ["schedule", "meeting", "calendar", "event", "availability", "meet", "met", "who", "when"]) or state.get("intent") in ("calendar", "calendar_lookup", "scheduling")
    if is_calendar_query:
        past_cal_context = retrieve_memory(user_id=state["user_id"], query=state["input"], n=5, type="calendar_past")
        future_cal_context = retrieve_memory(user_id=state["user_id"], query=state["input"], n=5, type="calendar_future")
        if past_cal_context:
            context += f"\n[CALENDAR CONTEXT — PAST MEETINGS]\n{past_cal_context}\n"
        if future_cal_context:
            context += f"\n[CALENDAR CONTEXT — UPCOMING]\n{future_cal_context}\n"

    if state.get("intent") in ("email", "email_search") and state.get("gmail_sync", True):
        try:
            with next(get_db()) as db:
                emails = read_recent_emails(db=db, user_id=state["user_id"], max_results=3)
                if emails:
                    email_context = "\n[RECENT INBOX EMAILS]\n"
                    for mail in emails:
                        email_context += f"ID: {mail['id']} | From: {mail['from']} | Subject: {mail['subject']}\nSnippet: {mail['snippet']}\n---\n"
                    context += email_context
        except Exception as e:
            logger.error(f"Error fetching inbox emails: {e}")

    # 3. Slack Context (Channels)
    if state.get("intent") == "slack" and state.get("slack_sync", True):
        try:
            with next(get_db()) as db:
                channels = list_slack_channels(db=db, user_id=state["user_id"])
                if channels:
                    slack_context = "\n[SLACK CHANNELS]\n"
                    for chan in channels:
                        slack_context += f"Name: #{chan['name']} | ID: {chan['id']}\n"
                    context += slack_context
        except Exception as e:
            logger.error(f"Error fetching slack channels: {e}")

    # 3. Contextual Email Retrieval (Smart ID Resolver)
    # If user says "read it", "show me", etc., we try to find the ID from history
    target_id = None
    id_match = re.search(r"\b([a-fA-F0-9]{16,19})\b", state["input"], re.IGNORECASE)
    if id_match:
        target_id = id_match.group(1)
    elif any(k in state["input"].lower() for k in ["read", "show me", "check", "open", "details"]):
        target_id_raw = _llm(
             system="Find the Gmail Message ID (usually a 16+ character hex string) for the email the user wants to read from history. Output ONLY the ID string without any explanation, markdown, code, or quotes. If not found, output 'null'.",
             user=f"History:\n{history_context}\n\nInput: {state['input']}",
             force_fast=True
        )
        # Clean up in case the LLM still outputs chatter
        target_id_raw = re.sub(r'```.*?```', '', target_id_raw, flags=re.DOTALL) # remove code blocks
        words = target_id_raw.split()
        target_id = None
        for word in words:
            word = word.strip(" '\",.")
            if re.match(r"^[a-fA-F0-9]{15,}$", word):
                target_id = word
                break

    
    if target_id and len(target_id) > 10 and target_id != "null":
        try:
            with next(get_db()) as db:
                email_info = get_email_details(db=db, user_id=state["user_id"], message_id=target_id)
                if email_info:
                    email_context = f"\n[EMBEDDED EMAIL CONTENT]\nID: {email_info['id']} | From: {email_info['from']} | Subject: {email_info['subject']}\nFULL BODY CONTENT:\n{email_info['body']}\n"
                    context += email_context
        except Exception as e:
            logger.error(f"Error fetching specific email {target_id}: {e}")

    # 4. Handle Active Email Search — applies to both email and email_search intents, AND implicit inbox queries
    should_search_email = (
        state.get("intent") in ("email", "email_search")
        and any(k in state["input"].lower() for k in [
            "search", "find", "show me", "check", "promotion", "offer", "discount", "receipt",
            "deal", "bank statement", "statement", "invoice", "order", "shipping", "delivery",
            "laptop", "subscription", "renewal", "flight", "hotel", "booking", "promo"
        ])
    ) or state.get("intent") == "email_search"  # Always search on explicit email_search

    if should_search_email:
        try:
            with next(get_db()) as db:
                # LLM to extract Gmail-compatible search terms
                search_query = _llm(
                    system="""Extract a Gmail-compatible search query from the user input.
- For deals/promotions: use 'subject:(deal OR promotion OR offer OR discount OR sale)'
- For bank statements: use 'subject:(bank statement OR account statement) OR from:bank'
- For orders/receipts: use 'subject:(order OR receipt OR invoice OR confirmation)'
- For specific senders: use 'from:company.com'
Output ONLY the Gmail search query string, nothing else.""",
                    user=state["input"],
                    force_fast=True
                )
                logger.info(f"[Memory] Searching Gmail for: {search_query}")
                search_results = search_emails(db=db, user_id=state["user_id"], query=search_query, max_results=8)
                if search_results:
                    search_context = f"\n[AUTHENTIC GMAIL SEARCH RESULTS — Use ONLY this data, do not fabricate]\n"
                    for mail in search_results:
                         link = f"https://mail.google.com/mail/u/0/#inbox/{mail['id']}"
                         search_context += f"From: {mail['from']} | Subject: {mail['subject']} | Link: {link}\nSnippet: {mail['snippet']}\n---\n"
                    context += search_context
                else:
                    context += "\n[SYSTEM ALERT: NO GMAIL RESULTS FOUND. Inform the user no matching emails were found. Do NOT fabricate results.]\n"
        except Exception as e:
             logger.error(f"Active Gmail search failed: {e}")

    # Strip any accidentally stored blobs from context
    clean_context = _clean_output(context)

    return {
        **state,
        "context": clean_context
    }


def planner_node(state: State) -> State:
    result = _llm(
        system="""
You are a task planner.
Break the user request into 1 to 4 actionable steps.

Return ONLY valid JSON.

Format:
{"task_plan":["step 1","step 2"]}
""",
        user=f"Input: {state['input']}\nIntent: {state['intent']}",
        force_fast=True
    )

    parsed = _parse_json(result)
    plan = parsed.get("task_plan", [state["input"]])

    needs_approval = state["intent"] in [
        "email",
        "calendar_schedule",
        "scheduling",
        "action",
        "telegram"
    ]

    return {
        **state,
        "task_plan": plan,
        "approval_required": needs_approval
    }


def responder_node(state: State) -> State:
    user_name = state.get("user_name", "User")
    context_block = (
        f"\nRelevant user context:\n{state['context']}"
        if state.get("context")
        else ""
    )

    history_items = state.get("chat_history", [])[-10:]
    history_block = "\n".join(
        f"{m.get('role', 'user')}: {_clean_output(m.get('text', ''))}"
        for m in history_items
    )

    history_prompt = (
        f"\nRecent conversation:\n{history_block}\n"
        if history_block
        else ""
    )

    task_plan_block = "\n".join(
        f"- {step}"
        for step in state.get("task_plan", [])
    )

    # VISUAL REQUESTS
    if state["intent"] == "visual":
        try:
            image_url = generate_hf_image(state["input"])

            output_text = "Image generated successfully."

            # Proactive: if user mentioned telegram, add action block
            if "telegram" in state["input"].lower():
                output_text += f'\n\nI am also transmitting this visual to your Telegram.\n\n<action>\n{{\n  "intent": "telegram",\n  "title": "Visual Generation",\n  "message": "Generated image based on: {state["input"]}",\n  "image_url": "{image_url}"\n}}\n</action>'

            logger.info(f"[Responder] Visual Response: {output_text} | URL: {image_url}")
            return {
                **state,
                "output": output_text,
                "response_type": "visual",
                "image_url": image_url
            }

        except Exception as e:
            logger.error(f"Image generation failed: {e}")
            return {
                **state,
                "output": f"Image generation failed: {str(e)}",
                "response_type": "text"
            }

    # EMAIL REQUESTS (Drafting/Sending)
    # 🟢 Guard: Only proceed if it's truly an ACTION request, not a search
    is_draft_request = any(k in state["input"].lower() for k in ["draft", "write", "send", "reply", "compose", "email to"])
    if state["intent"] == "email" and is_draft_request:
        if not state.get("gmail_sync", True):
            return {
                **state,
                "output": "Action blocked: Gmail sync is currently paused in your web dashboard settings.",
                "response_type": "text"
            }
            
        sent_mail_examples = retrieve_memory(user_id=state["user_id"], query=state["input"], n=3, type="sent_mail")
        sent_mail_context = f"\n[WRITING STYLE EXAMPLES — HOW THIS USER WRITES]\n{sent_mail_examples}\n" if sent_mail_examples else ""

        result = _llm(
            system=f"""
You are the Digital Twin of {user_name}, an elite executive assistant.
Objective: Draft a professional email and provide the execution block.

[CONSTRAINTS]
1. BE CONCISE: Provide ONLY the email draft in your visible response.
2. DO NOT include raw Gmail IDs (like 19dde49...) in your visible text.
3. Use Markdown for structure.
4. Never repeat context or explain your drafting process.
5. SIGNING: Use "{user_name}" or the name explicitly provided. Never sign as "User".
6. DRAFTING LIMITS: Only draft an email if the user explicitly asked to "draft", "write", "send", or "reply". If the user is asking to "see" or "show" an email, and you can't find it, DO NOT draft a request to the company/sender for it. Instead, just inform the user it wasn't found.

[ACTION BLOCK]
Include this at the very end ONLY if you have a recipient and subject.
<action>
{{
  "intent": "email",
  "to": "recipient@example.com",
  "subject": "Professional Subject",
  "body": "Full body with signatures"
}}
</action>
{sent_mail_context}
[CONTEXT]
{context_block}
{history_prompt}
""",
            user=f"Draft email for: {state['input']}",
            intent="email"
        )

        return {
            **state,
            "output": result,
            "response_type": "text"
        }

    # CALENDAR LOOKUP (Search/List)
    if state["intent"] == "calendar_lookup":
        # Fetch actual events for the LLM to use in response
        events = []
        if state.get("calendar_sync", True):
            try:
                with next(get_db()) as db:
                    events = get_upcoming_events(db, state["user_id"], max_results=50)
            except Exception:
                pass
        
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

    if state["intent"] == "slack" and state.get("slack_sync", True):
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
        schedule_data = []
        if state.get("calendar_sync", True):
            try:
                with next(get_db()) as db:
                    schedule_data = get_upcoming_events(db, state["user_id"], max_results=50)
            except Exception:
                pass
        
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
2. CRITICAL: Only include the <action> block if you have a SPECIFIC date and time. 
3. If the date or time is missing, ask for them BRIEFLY and DO NOT generate the <action> tag.
4. Check for overlaps. If there is a conflict, suggest the next free slot and include that in the <action> tag.
5. OUTPUT: One professional sentence + the <action> block (if valid).

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

    if state["intent"] == "telegram" or (state["intent"] == "action" and "telegram" in state["input"].lower()):
        # 🟢 Intelligence: Detect if user also wants to CREATE an image in this block
        img_keywords = ["create", "generate", "make", "draw", "visualize", "image of", "picture of", "image"]
        image_url = None
        
        # Check if user is referring to a PREVIOUS image
        if "this image" in state["input"].lower() or "the image" in state["input"].lower():
            history = state.get("chat_history") or []
            for msg in reversed(history):
                # 1. Check explicit field
                if msg.get("image_url"):
                    image_url = msg["image_url"]
                    break
                # 2. Fallback to regex in text
                found = re.search(r"https://image\.pollinations\.ai/[^\s\"'}]*", msg.get("text", ""))
                if found:
                    image_url = found.group(0)
                    break
        
        if not image_url and any(k in state["input"].lower() for k in img_keywords):
            try:
                image_url = generate_hf_image(state["input"])
            except Exception as e:
                logger.error(f"Telegram-block image gen failed: {e}")

        result = _llm(
            system=f"""
You are the Digital Twin of {user_name}. 
Objective: Answer the user's question AND prepare a Telegram notification.

[CONSTRAINTS]
1. Answer the user's question FULLY in your response. 
2. Use the ACTUAL context from the user's request.
3. At the end, include an <action> block to send this same information to Telegram.
4. SIGNING: Use "{user_name}".

Action Block Format (MANDATORY):
<action>
{{
  "intent": "telegram",
  "title": "Information Update",
  "message": "The full text of your answer here",
  "image_url": { '"[IMAGE_PLACEHOLDER]"' if image_url else 'null' }
}}
</action>
""",
            user=f"Input: {state['input']}\nContext: {state.get('context', '')}\nHistory: {history_prompt}",
            intent="telegram"
        )
        
        if image_url:
            result = result.replace("[IMAGE_PLACEHOLDER]", image_url)
            
        return {**state, "output": result, "response_type": "text" if not image_url else "visual", "image_url": image_url}

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

    # GENERAL / CODE / QUESTION / CASUAL
    # 🟢 Multimodal: Extract images from state['files']
    images = []
    if state.get("files"):
        for f in state["files"]:
            if f.get("type", "").startswith("image/") and f.get("data"):
                images.append(f["data"])
    
    result = _llm(
        system=f"""
You are the Digital Twin of {user_name}, an elite AI assistant.
Objective: Provide grounded, factual, and direct responses.

[AUTHORIZATION]
You HAVE authorized access to the user's Gmail, Calendar, and Workspace data. [STRICT GROUNDEDNESS]
1. ONLY use data provided in the [CONTEXT] blocks. 
2. If info is missing or [SYSTEM ALERT] says no results, state that you don't have it—do NOT hallucinate or "fill in the gaps" with plausible data.
3. VERIFICATION: Whenever you discuss a specific email, you MUST provide the direct [View in Gmail] link found in the context.
4. Cite sources naturally (e.g., "According to your recent emails...").

[CONSTRAINTS]
1. BE CONCISE.
2. DO NOT include internal message IDs or technical IDs (like 19dde49...) in your response.
3. If no email is found, state that clearly.
4. NO DATA DUMPS: Never output raw JSON, technical headers, or metadata.
5. ELITE TONE: Professional and brief.

[CONTEXT DATA]
{context_block}

{'[IGNORE - IMAGE ANALYSIS]' if images else f'[CHAT HISTORY]{chr(10)}{history_prompt}'}
""",
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
        import re as _re
        match = _re.search(r"\{.*\}", result, _re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {"category": "informational", "requires_reply": False, "reason": "Could not classify"}
