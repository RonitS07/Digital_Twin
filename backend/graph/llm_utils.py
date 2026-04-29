import os
import logging
from groq import Groq

logger = logging.getLogger(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Small model — fast, cheap: intent classification, memory queries, casual chat
FAST_MODEL = "llama-3.1-8b-instant"

# Large model — for complex reasoning: email drafting, scheduling, code, JSON extraction
SMART_MODEL = "llama-3.3-70b-versatile"

# Intents that need the heavy model for quality JSON/reasoning
_SMART_INTENTS = {
    "email", "scheduling", "calendar_schedule", "calendar_lookup",
    "schedule_with_user", "visual", "slack", "telegram"
}


def _llm(system: str, user: str, intent: str = "", force_fast: bool = False) -> str:
    """
    Unified LLM call with automatic model routing.
    - Simple/classification tasks → FAST_MODEL (8B)
    - Complex tasks (email, scheduling, JSON) → SMART_MODEL (70B)
    """
    model = FAST_MODEL if force_fast else (
        SMART_MODEL if intent in _SMART_INTENTS else FAST_MODEL
    )
    try:
        resp = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user}
            ],
            model=model,
            temperature=0,
            max_tokens=2048,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"[LLM] {model} call failed: {e}")
        # Fallback to fast model if smart model fails
        if model == SMART_MODEL:
            try:
                resp = client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user}
                    ],
                    model=FAST_MODEL,
                    temperature=0,
                    max_tokens=2048,
                )
                return resp.choices[0].message.content.strip()
            except Exception as e2:
                logger.error(f"[LLM] Fallback also failed: {e2}")
                raise
        raise
