import logging

from llm.client import (
    chat_complete,
    chat_complete_vision,
    AllProvidersFailedError,
    user_facing_llm_error,
    OPENROUTER_MODELS,
)

logger = logging.getLogger(__name__)

VISION_MODEL = OPENROUTER_MODELS["vision"]
VISION_ALT_MODEL = OPENROUTER_MODELS["vision_alt"]

# Intents that benefit from the smart tier (still falls back to fast + OpenRouter)
_SMART_INTENTS = {
    "email", "scheduling", "calendar_schedule", "calendar_lookup",
    "schedule_with_user", "visual", "slack", "telegram",
}


def _llm(system: str, user: str, intent: str = "", force_fast: bool = False, images: list = None, retries: int = 3) -> str:
    """
    Unified LLM router with multi-provider fallback.
    Vision → OpenRouter. Text → Groq fast/smart with OpenRouter diversifiers on 429.
    """
    del retries  # legacy param; fallback chain handles retries across models

    if images:
        b64 = images[0].split(",")[-1] if "," in images[0] else images[0]
        media_type = "image/png"
        if b64.startswith("/9j/"):
            media_type = "image/jpeg"
        elif b64.startswith("iVBORw"):
            media_type = "image/png"
        elif b64.startswith("R0lGOD"):
            media_type = "image/gif"
        elif b64.startswith("UklGR"):
            media_type = "image/webp"

        prompt = f"{system}\n\n{user}" if system else user
        try:
            return chat_complete_vision(
                text_prompt=prompt,
                image_source=b64,
                image_type="base64",
                tier="vision",
                temperature=0.2,
                max_tokens=1500,
            )
        except Exception as e:
            logger.error(f"[LLM Vision] failed: {e}")
            return "Visual analysis is temporarily unavailable. Please try again shortly."

    tier = "fast" if force_fast else ("smart" if intent in _SMART_INTENTS else "fast")
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    try:
        return chat_complete(messages, tier=tier, temperature=0, max_tokens=2048)
    except AllProvidersFailedError as e:
        logger.error(f"[LLM] all providers failed for intent={intent}: {e}")
        return user_facing_llm_error(e)
    except Exception as e:
        logger.error(f"[LLM] unexpected error for intent={intent}: {e}")
        return user_facing_llm_error(e)
