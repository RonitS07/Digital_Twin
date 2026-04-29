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

    # Fetch the image server-side → return as base64 data URL (works in any <img> tag)
    response = requests.get(url, timeout=90)
    if response.status_code != 200:
        raise Exception(f"Pollinations returned {response.status_code}: {response.text[:200]}")

    image_b64 = base64.b64encode(response.content).decode("utf-8")
    content_type = response.headers.get("Content-Type", "image/jpeg").split(";")[0]
    return f"data:{content_type};base64,{image_b64}"
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

    # Gmail/Email
    if any(k in user_input for k in ["email", "mail", "gmail", "inbox"]):
        if any(k in user_input for k in ["search", "find", "show me", "read", "unread", "recent", "what did", "check", "promotion", "offer"]):
            return {**state, "intent": "email_search"}
        return {**state, "intent": "email"}

    # Slack
    if "slack" in user_input:
        return {**state, "intent": "slack"}

    # Telegram
    if "telegram" in user_input:
        return {**state, "intent": "telegram"}

    # Fallback to LLM for more complex classification
    result = _llm(
        system="""
You are a strict intent classifier. Return ONLY valid JSON: {"intent":"category", "target_handle": "null_or_handle"}
Categories: question, visual (image creation), casual, email, email_search, calendar, calendar_lookup, slack, telegram, other.
""",
        user=state["input"]
    )
    parsed = _parse_json(result)
    return {**state, "intent": parsed.get("intent", "other"), "target_user_handle": parsed.get("target_handle")}


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

    if state.get("intent") == "email" and state.get("gmail_sync", True):
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

    match = re.search(r"\b([a-f0-9]{16})\b", state["input"])
    if match:
        email_id = match.group(1)
        try:
            with next(get_db()) as db:
                email_info = get_email_details(db=db, user_id=state["user_id"], message_id=email_id)
                if email_info:
                    email_context = f"""
[EMBEDDED EMAIL CONTENT]
ID: {email_info['id']}
From: {email_info['from']}
Subject: {email_info['subject']}
Snippet: {email_info['snippet']}
"""
                    context += "\n" + email_context
        except Exception as e:
            logger.error(f"Error fetching specific email {email_id}: {e}")

    # 3. Handle Active Email Search — ONLY for email intent
    if state.get("intent") in ("email", "email_search") and any(k in state["input"].lower() for k in ["search", "find", "show me", "check", "promotion", "offer", "discount", "receipt"]):
        try:
            with next(get_db()) as db:
                # LLM to extract search terms
                search_query = _llm(
                    system="Extract a Gmail-compatible search query from the user input. Example: 'laptop promotion' or 'from:apple order'. Output ONLY the query string.",
                    user=state["input"],
                    force_fast=True
                )
                logger.info(f"[Memory] Searching Gmail for: {search_query}")
                search_results = search_emails(db=db, user_id=state["user_id"], query=search_query, max_results=5)
                if search_results:
                    search_context = f"\n[GMAIL SEARCH RESULTS FOR: '{search_query}']\n"
                    for mail in search_results:
                         search_context += f"From: {mail['from']} | Subject: {mail['subject']} | Date: {mail['date']}\nSnippet: {mail['snippet']}\n---\n"
                    context += search_context
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

    plan_block = "\n".join(
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

    # EMAIL REQUESTS
    if state["intent"] == "email":
        if not state.get("gmail_sync", True):
            return {
                **state,
                "output": "Action blocked: Gmail sync is currently paused in your web dashboard settings.",
                "response_type": "text"
            }
            
        user_name = state.get("user_name", "User")
        result = _llm(
            system=f"""
You are the Digital Twin of {user_name}, a high-level executive assistant.
Objective: Draft an articulate, expanded, and professional email and provide a hidden execution block.

Rules:
1. PROVIDE a natural, visible message to the user confirming the draft.
2. INCLUDE a hidden <action> block at the very end.
3. EXPERTLY EXPAND the user's brief notes. If they say "testing", write a professional "Hello, I'm verifying the system connectivity..." email.
4. BE PROACTIVE: Add polite details, professional greetings, and a clear call to action based on the inferred context.

Formatting Rules for the email content:
- Use clear line breaks between greeting, body, and closing.
- SIGN THE EMAIL correctly: Prioritize any name mentioned in the user's prompt (e.g. if they say "regards ronit", sign as "Ronit"). If no name is in the prompt, use "{user_name}".
- CRITICAL: Never sign as "User".

Action Block Rules:
- The block MUST be valid JSON.
- The "body" field MUST contain the COMPLETE email (Greeting + Expanded Body + Signature).
- EXTREMELY IMPORTANT: Do NOT use brackets like [Body]. Use real data.
<action>
{{
  "intent": "email",
  "to": "email@example.com",
  "subject": "Clear subject line",
  "body": "The full email content including signature with \\n for newlines"
}}
</action>

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

    if state["intent"] == "slack" and state.get("slack_sync", True):
        # Check if user is asking for a briefing
        briefing_content = ""
        if "briefing" in state["input"].lower() or "report" in state["input"].lower():
            try:
                with next(get_db()) as db:
                    briefing_content = generate_daily_briefing(db, state["user_id"], state.get("user_name", "User"))
            except Exception as e:
                logger.error(f"Failed to generate briefing for Slack: {e}")

        text_val = briefing_content if briefing_content else "Your message"
        plan_block = """
[SLACK PROTOCOL]
- If the user wants to see their channels: List them clearly in plain text. DO NOT generate an <action> tag for listing.
- If the user wants to send a message: 
    1. Identify the channel ID and Name from [SLACK CHANNELS].
    2. Format an action tag: <action>{"intent":"slack", "channel_id":"ID", "channel_name":"Name", "text":{json.dumps(text_val)}}</action>
    3. Confirm to the user that you are ready to post that specific message.
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
{plan_block}
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
        user_name = state.get("user_name", "User")
        _now = datetime.now()
        now_context = f"Today is {_now.strftime('%A, %B %d, %Y')}. The year is {_now.year}."
        
        result = _llm(
            system=f"""
You are a professional executive scheduler.
Objective: Extract meeting details and detect potential conflicts in the user's schedule.

Context: {now_context} 
Current Schedule:
{schedule_context}

Rules:
1. Extract the requested meeting time.
2. If the user's current input is a confirmation (like "Yes", "Ok", "Do it"), LOOK AT THE HISTORY to find the previously proposed time/slot and extract those details.
3. Check if the time OVERLAPS with any existing meetings in the 'Current Schedule'.
4. If there is a conflict:
   - Inform the user politely.
   - Suggest the NEXT available slot (usually 30-60 mins later or the first free gap).
   - Use the alternative slot in the <action> block.
   - Set "is_conflict": true in JSON.
5. If NO conflict:
   - Set "is_conflict": false.
6. Provide a professional confirmation message (e.g. "I have prepared the meeting invite..."). Do NOT output raw JSON in your message body.
7. YOU MUST OUTPUT THE EXACT <action> JSON BLOCK AT THE VERY END OF YOUR RESPONSE.

Action Block Format:
<action>
{{
  "intent": "calendar",
  "title": "Actual extracted title",
  "start_datetime": "YYYY-MM-DDTHH:MM:SS+05:30",
  "end_datetime": "YYYY-MM-DDTHH:MM:SS+05:30",
  "attendees": ["email@example.com"],
  "description": "Short summary",
  "is_conflict": true/false,
  "conflict_with": "Existing meeting title"
}}
</action>

- Default duration is 30 minutes if not specified.
{context_block}
{history_prompt}
""",
            user=f"Current user input: {state['input']}\nAction: Extract meeting details from history or current input.",
            intent="scheduling"
        )

        return {
            **state,
            "output": result,
            "response_type": "text"
        }

    if state["intent"] == "telegram" or (state["intent"] == "action" and "telegram" in state["input"].lower()):
        # 🟢 Intelligence: Detect if user also wants to CREATE an image in this block
        img_keywords = ["create", "generate", "make", "draw", "visualize", "image of", "picture of"]
        image_url = None
        if any(k in state["input"].lower() for k in img_keywords):
            try:
                image_url = generate_hf_image(state["input"])
            except Exception as e:
                logger.error(f"Telegram-block image gen failed: {e}")

        result = _llm(
            system=f"""
You are the Digital Twin. The user requested to send a Telegram notification.
{'The user also requested an image which has been GENERATED.' if image_url else ''}

Output a professional confirmation AND wrap the explicit execution details in an <action> JSON block at the end.

Action Block Format:
<action>
{{
  "intent": "telegram",
  "title": "Telegram Notification",
  "message": "Hello from your AI Twin!",
  "image_url": { '"[IMAGE_PLACEHOLDER]"' if image_url else 'null' }
}}
</action>

Provide a short, visible confirmation to the user first.
""",
            user=state["input"]
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
                try:
                    common_slots = asyncio.run(
                        find_common_slots(
                            db=db,
                            user_a_id=state["user_id"],
                            user_b_id=target_agent.user_id,
                            duration_minutes=duration,
                            lookahead_days=7,
                        )
                    )
                except RuntimeError:
                    # Already inside a running event loop (uvicorn context)
                    loop = asyncio.get_event_loop()
                    common_slots = loop.run_until_complete(
                        find_common_slots(
                            db=db,
                            user_a_id=state["user_id"],
                            user_b_id=target_agent.user_id,
                            duration_minutes=duration,
                            lookahead_days=7,
                        )
                    )

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
                loop.run_until_complete(push_to_inbox(target_agent.user_id, {
                    "msg_id": msg.msg_id,
                    "sender_user_id": msg.sender_user_id,
                    "msg_type": msg.msg_type,
                    "payload": msg.payload,
                    "requires_hitl": msg.requires_hitl,
                    "timestamp": msg.timestamp,
                }))

                # Format slots for display
                slot_lines = []
                for i, s in enumerate(common_slots[:3], 1):
                    try:
                        start_dt = datetime.fromisoformat(s["start"])
                        slot_lines.append(f"  **Option {i}:** {start_dt.strftime('%A, %b %d at %I:%M %p')} ({s['duration_minutes']} min)")
                    except Exception:
                        slot_lines.append(f"  **Option {i}:** {s['start']}")

                slots_text = "\n".join(slot_lines)
                user_name = state.get("user_name", "You")

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
    user_name = state.get("user_name", "User")
    result = _llm(
        system=f"""
You are the Digital Twin of {user_name}, a premier AI assistant.
Your goal is to provide perfectly grounded, factual, and helpful responses.

STRICT GROUNDEDNESS RULES:
1. ONLY use data provided in the [CONTEXT] blocks. 
2. If you are unsure about a fact (time, name, event) or it's missing from context, DO NOT hallucinate. Inform the user you don't have that information.
3. Always cite your sources naturally (e.g., "From your recent emails, I see..." or "Based on your past chats...").
4. If the user refers to a previous topic, use the [CHAT HISTORY] and [RELEVANT MEMORY] to maintain continuity.
5. NO PLACEHOLDERS: Don't output [Time] or [Name]. Use real data or state it's unavailable.

TONE:
Professional, direct, and elite. You are {user_name}'s primary interface to their digital life.

[CONTEXT DATA]
{context_block}

[CHAT HISTORY]
{history_prompt}
""",
            user=f"Input: {state['input']}\nPlan: {plan_block}"
    )

    clean_out = _clean_output(result)
    if not clean_out or not clean_out.strip():
        clean_out = "Task completed successfully, but no descriptive response was generated."

    return {
        **state,
        "output": clean_out,
        "response_type": "text"
    }