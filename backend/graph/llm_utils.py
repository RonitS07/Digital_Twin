import os
import logging
from groq import Groq

logger = logging.getLogger(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Small model — fast, cheap: intent classification, memory queries, casual chat
FAST_MODEL = "llama-3.1-8b-instant"

# Large model — for complex reasoning: email drafting, scheduling, code, JSON extraction
SMART_MODEL = "llama-3.3-70b-versatile"

# Vision model
VISION_MODEL = "llama-3.2-11b-vision-preview"

# Intents that need the heavy model for quality JSON/reasoning
_SMART_INTENTS = {
    "email", "scheduling", "calendar_schedule", "calendar_lookup",
    "schedule_with_user", "visual", "slack", "telegram"
}


import time

def _llm(system: str, user: str, intent: str = "", force_fast: bool = False, images: list = None, retries: int = 3) -> str:
    """
    Unified LLM call with automatic model routing and rate-limit handling.
    """
    if images:
        model = VISION_MODEL
    else:
        model = FAST_MODEL if force_fast else (
            SMART_MODEL if intent in _SMART_INTENTS else FAST_MODEL
        )
        
    for attempt in range(retries):
        try:
            content = []
            if images:
                content.append({"type": "text", "text": user})
                for img_data in images:
                    b64 = img_data.split(",")[-1] if "," in img_data else img_data
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                    })
            else:
                content = user

            resp = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": content}
                ],
                model=model,
                temperature=0,
                max_tokens=2048,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            err_msg = str(e)
            is_rate_limit = "429" in err_msg
            
            if is_rate_limit and attempt < retries - 1:
                wait_time = (attempt + 1) * 2 # Simple backoff
                logger.warning(f"[LLM] Rate limited (429). Retrying in {wait_time}s... (Attempt {attempt+1}/{retries})")
                time.sleep(wait_time)
                continue
                
            if attempt == retries - 1:
                # If it's a rate limit (429), log as warning instead of error if we can fallback
                if is_rate_limit and model in (SMART_MODEL, VISION_MODEL):
                    logger.warning(f"[LLM] {model} rate limited after {retries} attempts, falling back to {FAST_MODEL}")
                else:
                    logger.error(f"[LLM] {model} call failed after {retries} attempts: {e}")
                
                # Fallback to fast model if smart/vision model fails (strip images for fallback)
                if model in (SMART_MODEL, VISION_MODEL):
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
    return ""
