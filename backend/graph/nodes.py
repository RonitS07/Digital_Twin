import os
import json
import re
from groq import Groq
from graph.state import State
from memory.chroma import retrieve_memory
from tools.gmail_tool import get_email_details

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.1-8b-instant"

def _llm(system: str, user: str) -> str:
    resp = client.chat.completions.create(
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user}
        ],
        model=MODEL,
        temperature=0
    )
    return resp.choices[0].message.content.strip()

def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {}

def classifier_node(state: State) -> State:
    result = _llm(
        system='''You are a strict intent classifier. Return ONLY valid JSON. No explanation.
Categories: question | task | casual | email | calendar | other
Format: {"intent": "category"}''',
        user=state["input"]
    )
    parsed = _parse_json(result)
    return {**state, "intent": parsed.get("intent", "other")}

def memory_node(state: State) -> State:
    # 1. Standard memory retrieval
    context = retrieve_memory(user_id=state["user_id"], query=state["input"])
    
    # 2. Check for email ID in input (basic heuristic for full automation)
    # Look for 16-character hex strings which are common for Gmail IDs
    match = re.search(r'\b([a-f0-9]{16})\b', state["input"])
    if match:
        email_id = match.group(1)
        try:
            email_info = get_email_details(email_id)
            email_context = f"\n[EMBEDDED EMAIL CONTENT]\nID: {email_info['id']}\nFrom: {email_info['from']}\nSubject: {email_info['subject']}\nSnippet: {email_info['snippet']}\n"
            context += email_context
        except Exception as e:
            print(f"Error fetching email: {e}")

    return {**state, "context": context}

def planner_node(state: State) -> State:
    result = _llm(
        system='''You are a task planner. Break the input into 1-4 actionable steps.
Return ONLY valid JSON. Format: {"task_plan": ["step 1", "step 2"]}''',
        user=f"Input: {state['input']}\nIntent: {state['intent']}"
    )
    parsed = _parse_json(result)
    plan = parsed.get("task_plan", [state["input"]])
    needs_approval = state["intent"] in ["email", "calendar", "task"]
    return {**state, "task_plan": plan, "approval_required": needs_approval}

def responder_node(state: State) -> State:
    context_block = (
        f"\nRelevant context from user memory:\n{state['context']}"
        if state["context"] else ""
    )
    plan_block = "\n".join(f"- {s}" for s in state["task_plan"])
    result = _llm(
        system=f'''You are an intelligent AI twin assistant acting on behalf of the user.
{context_block}
IMPORTANT: If your task is to draft an email, strictly follow this format:
<thinking>Your reasoning here</thinking>
<reply>The actual email body here (and nothing else)</reply>''',
        user=f"User request: {state['input']}\n\nTask plan:\n{plan_block}"
    )
    return {**state, "output": result}
 