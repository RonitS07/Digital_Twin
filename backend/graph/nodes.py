import os
import json
import re
import requests
import base64
import logging
from datetime import datetime
from groq import Groq
from graph.state import State
from memory.chroma import retrieve_memory
from tools.gmail_tool import get_email_details, read_recent_emails
from db.database import get_db

logger = logging.getLogger(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.1-8b-instant"


def _llm(system: str, user: str) -> str:
    resp = client.chat.completions.create(
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        model=MODEL,
        temperature=0
    )
    return resp.choices[0].message.content.strip()

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
    text = text.strip()
    return text


def classifier_node(state: State) -> State:
    result = _llm(
        system="""
You are a strict intent classifier.
Return ONLY valid JSON.

Categories:
question = general questions, explanations, research
code = programming, debugging, code generation
visual = chart, graph, diagram, infographic, image requests
casual = greetings, small talk
email = send/write/reply email requests (DO NOT use for calendar invites)
calendar = schedule meeting, calendar, appointment requests, calendar invites
action = external actions or system changes
other = fallback

Format:
{"intent":"category"}
""",
        user=state["input"]
    )

    parsed = _parse_json(result)
    intent = parsed.get("intent", "other").lower()

    return {
        **state,
        "intent": intent
    }


def memory_node(state: State) -> State:
    chat_context = retrieve_memory(user_id=state["user_id"], query=state["input"], type="chat")
    structured_context = retrieve_memory(user_id=state["user_id"], query=state["input"], type="structured")

    context = ""
    if structured_context:
        context += "\n[LEARNED USER MEMORY]\n" + structured_context.strip() + "\n"
    if chat_context:
        context += "\n[RELEVANT CHAT MEMORY]\n" + chat_context.strip() + "\n"

    if state.get("intent") == "email":
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

    return {
        **state,
        "context": context
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
        user=f"Input: {state['input']}\nIntent: {state['intent']}"
    )

    parsed = _parse_json(result)
    plan = parsed.get("task_plan", [state["input"]])

    needs_approval = state["intent"] in [
        "email",
        "calendar",
        "action"
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
        f"{m.get('role', 'user')}: {m.get('text', '')}"
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

        return {
            **state,
            "output": "Image generated successfully.",
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
            user=f"Draft email for: {state['input']}"
        )

        return {
            **state,
            "output": result,
            "response_type": "text"
        }

    # CALENDAR REQUESTS
    if state["intent"] in ["calendar", "meeting"]:
        # We allow the LLM to handle date extraction even if there are typos in the input.
        # Minimal surface check just to ensure it's a scheduling intent.
        
        user_name = state.get("user_name", "User")
        _now = datetime.now()
        now_context = f"Today is {_now.strftime('%A, %B %d, %Y')}. The year is {_now.year}."
        result = _llm(
            system=f"""
You are a professional executive scheduler.
Objective: Extract meeting details and calculate exact ISO 8601 timestamps.

Context: {now_context} 
IMPORTANT: Use the context above to resolve relative dates like "tomorrow" or "next Friday".

Rules:
- Reply with a professional confirmation message.
- At the very end, include the <action> block in valid JSON format.
- EXTREMELY IMPORTANT: Do NOT use brackets like [Meeting Title] in the JSON. Fill in the actual data.

Action Block Format:
<action>
{{
  "intent": "calendar",
  "title": "Actual extracted title",
  "start_datetime": "YYYY-MM-DDTHH:MM:SS+05:30",
  "end_datetime": "YYYY-MM-DDTHH:MM:SS+05:30",
  "attendees": ["email@example.com"],
  "description": "Short summary"
}}
</action>

- If the user doesn't provide enough info (time/date), ask them for it and DO NOT output an <action> block.
- Default duration is 30 minutes if not specified.
{context_block}
{history_prompt}
""",
            user=f"Extract meeting details for: {state['input']}"
        )

        return {
            **state,
            "output": result,
            "response_type": "text"
        }

    # GENERAL / CODE / QUESTION / CASUAL
    user_name = state.get("user_name", "User")
    result = _llm(
        system=f"""
You are the Digital Twin of {user_name}. You are a premium, intelligent executive assistant.

Rules:
- Tone: Professional, direct, and elite. 
- Format: Clean markdown.
- Personalization: You are fully aware of who you are assisting ({user_name}). Feel free to acknowledge their name and personal preferences.
- Format: Clean markdown.
- Sign off as "{user_name}" if appropriate (e.g. for long-form answers).
{context_block}
{history_prompt}
""",
            user=f"Input: {state['input']}\nPlan: {plan_block}"
    )

    return {
        **state,
        "output": _clean_output(result),
        "response_type": "text"
    }