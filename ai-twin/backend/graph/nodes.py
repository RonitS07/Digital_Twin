import os
import json
import re
from groq import Groq
from graph.state import State
from memory.chroma import retrieve_memory

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
    context = retrieve_memory(user_id=state["user_id"], query=state["input"])
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
Use the task plan and any available context to give a clear, helpful, direct response.
Do not mention that you are an AI unless asked.{context_block}''',
        user=f"User said: {state['input']}\n\nTask plan:\n{plan_block}"
    )
    return {**state, "output": result}
