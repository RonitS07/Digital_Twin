import logging
import time
from groq import Groq
from openai import OpenAI
from core.config import settings

logger = logging.getLogger(__name__)

# Initialize direct Groq client for lightning fast text responses
groq_client = Groq(api_key=settings.GROQ_API_KEY)

# Initialize direct OpenRouter client for robust vision/image reading
openrouter_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.OPENROUTER_API_KEY or "",
)

# Text models (Groq)
FAST_MODEL = "llama-3.1-8b-instant"
SMART_MODEL = "llama-3.3-70b-versatile"

# Vision models (OpenRouter)
VISION_MODEL = "google/gemini-2.0-flash-exp:free"
VISION_ALT_MODEL = "meta-llama/llama-3.2-11b-vision-instruct:free"

# Intents that need the smart model for quality reasoning / complex JSON
_SMART_INTENTS = {
    "email", "scheduling", "calendar_schedule", "calendar_lookup",
    "schedule_with_user", "visual", "slack", "telegram"
}

def _llm(system: str, user: str, intent: str = "", force_fast: bool = False, images: list = None, retries: int = 3) -> str:
    """
    Unified, ultra-fast LLM router.
    - Text requests route directly to Groq (llama-3.1-8b-instant or llama-3.3-70b-versatile) for sub-second responses.
    - Vision requests route directly to OpenRouter (gemini-2.0-flash) for robust and accurate image understanding.
    """
    if images:
        # Vision flow: OpenRouter
        b64 = images[0].split(",")[-1] if "," in images[0] else images[0]
        
        # Detect media type from base64 header or default
        media_type = "image/png"
        if b64.startswith("/9j/"):
            media_type = "image/jpeg"
        elif b64.startswith("iVBORw"):
            media_type = "image/png"
        elif b64.startswith("R0lGOD"):
            media_type = "image/gif"
        elif b64.startswith("UklGR"):
            media_type = "image/webp"

        messages = [
            {
                "role": "system",
                "content": system
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{b64}",
                            "detail": "high"
                        }
                    }
                ]
            }
        ]

        last_error = None
        for vision_model in [VISION_MODEL, VISION_ALT_MODEL]:
            try:
                logger.info(f"[LLM Vision] Routing vision call to OpenRouter ({vision_model})")
                response = openrouter_client.chat.completions.create(
                    model=vision_model,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=1500,
                )
                content = response.choices[0].message.content
                if content:
                    return content.strip()
            except Exception as e:
                last_error = e
                logger.warning(f"[LLM Vision] {vision_model} failed: {e}")
                continue

        logger.error(f"[LLM Vision] All vision models failed: {last_error}")
        return "Visual analysis is temporarily unavailable. Please verify your OpenRouter credentials and try again."

    else:
        # Text flow: Groq
        model = FAST_MODEL if force_fast else (
            SMART_MODEL if intent in _SMART_INTENTS else FAST_MODEL
        )
        
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]

        for attempt in range(retries):
            try:
                logger.info(f"[LLM Groq] Routing text call to Groq ({model}) for intent: {intent}")
                resp = groq_client.chat.completions.create(
                    messages=messages,
                    model=model,
                    temperature=0,
                    max_tokens=2048,
                )
                return resp.choices[0].message.content.strip()
            except Exception as e:
                err_msg = str(e)
                is_rate_limit = "429" in err_msg
                
                if is_rate_limit and attempt < retries - 1:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f"[LLM Groq] Rate limited (429) on Groq. Retrying in {wait_time}s... ({attempt+1}/{retries})")
                    time.sleep(wait_time)
                    continue
                    
                if attempt == retries - 1:
                    logger.error(f"[LLM Groq] {model} call failed after {retries} attempts: {e}")
                    
                    if model == SMART_MODEL:
                        try:
                            logger.info(f"[LLM Groq] Smart model failed, falling back to Groq fast model ({FAST_MODEL})")
                            resp = groq_client.chat.completions.create(
                                messages=messages,
                                model=FAST_MODEL,
                                temperature=0,
                                max_tokens=2048,
                            )
                            return resp.choices[0].message.content.strip()
                        except Exception as e2:
                            logger.error(f"[LLM Groq] Fallback failed: {e2}")
                    
                    # Absolute fallback to OpenRouter text if Groq is completely down
                    if settings.OPENROUTER_API_KEY:
                        try:
                            logger.info(f"[LLM Fallback] Groq completely down, attempting OpenRouter fallback")
                            or_model = "meta-llama/llama-3.3-70b-instruct:free" if model == SMART_MODEL else "meta-llama/llama-3.1-8b-instruct:free"
                            resp = openrouter_client.chat.completions.create(
                                messages=messages,
                                model=or_model,
                                temperature=0,
                                max_tokens=2048,
                            )
                            return resp.choices[0].message.content.strip()
                        except Exception as e3:
                            logger.error(f"[LLM Fallback] OpenRouter fallback also failed: {e3}")
                    
                    raise e
        return ""
