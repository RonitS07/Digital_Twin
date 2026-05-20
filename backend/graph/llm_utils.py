import logging
import time
from core.config import settings

logger = logging.getLogger(__name__)

# Intents that need the heavy model for quality JSON/reasoning
_SMART_INTENTS = {
    "email", "scheduling", "calendar_schedule", "calendar_lookup",
    "schedule_with_user", "visual", "slack", "telegram"
}

def _llm(system: str, user: str, intent: str = "", force_fast: bool = False, images: list = None, retries: int = 3) -> str:
    """
    Unified LLM call with automatic model routing and rate-limit handling.
    Delegates to the new unified llm.client.
    """
    if images:
        from llm.client import chat_complete_vision
        # Use the unified vision client for images
        b64 = images[0].split(",")[-1] if "," in images[0] else images[0]
        try:
            return chat_complete_vision(
                text_prompt=f"{system}\n\n{user}",
                image_source=b64,
                image_type="base64",
                tier="vision"
            )
        except Exception as e:
            logger.error(f"[LLM] Vision call failed: {e}")
            return "Visual analysis is temporarily unavailable due to high server load or missing API keys. Please try again later."
    else:
        from llm.client import chat_complete
        tier = "fast" if force_fast else ("smart" if intent in _SMART_INTENTS else "fast")
        
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
        
        for attempt in range(retries):
            try:
                return chat_complete(messages=messages, tier=tier, temperature=0, max_tokens=2048)
            except Exception as e:
                err_msg = str(e)
                is_rate_limit = "429" in err_msg
                
                if is_rate_limit and attempt < retries - 1:
                    wait_time = (attempt + 1) * 2 # Simple backoff
                    logger.warning(f"[LLM] Rate limited (429). Retrying in {wait_time}s... (Attempt {attempt+1}/{retries})")
                    time.sleep(wait_time)
                    continue
                    
                if attempt == retries - 1:
                    logger.error(f"[LLM] Call failed after {retries} attempts: {e}")
                    if tier == "smart":
                        try:
                            # Fallback to fast
                            return chat_complete(messages=messages, tier="fast", temperature=0, max_tokens=2048)
                        except Exception as e2:
                            logger.error(f"[LLM] Fallback also failed: {e2}")
                            raise
                    raise
        return ""
