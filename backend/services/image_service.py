"""Server-side image generation with HuggingFace (primary) and Pollinations (fallback)."""

from __future__ import annotations

import hashlib
import io
import logging
import os
import urllib.parse
from typing import Tuple

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

GENERATED_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "generated")
HF_MODEL = "black-forest-labs/FLUX.1-schnell"


def _cache_path(prompt: str) -> str:
    digest = hashlib.sha256(prompt.strip().lower().encode()).hexdigest()[:16]
    return os.path.join(GENERATED_DIR, f"{digest}.jpg")


def _hf_token() -> str | None:
    return settings.HF_TOKEN or settings.HUGGINGFACE_API_KEY or os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_API_KEY")


def _generate_via_hf(prompt: str) -> Tuple[bytes, str]:
    token = _hf_token()
    if not token:
        raise RuntimeError("HuggingFace token not configured")

    from huggingface_hub import InferenceClient

    client = InferenceClient(token=token, provider="auto")
    image = client.text_to_image(prompt, model=HF_MODEL)
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), "image/jpeg"


def _generate_via_pollinations(prompt: str) -> Tuple[bytes, str]:
    encoded = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=768&model=flux"
    with httpx.Client(timeout=90.0) as client:
        resp = client.get(url, headers={"User-Agent": "Aether/1.0"})
        content_type = resp.headers.get("content-type", "")
        if resp.status_code != 200 or not content_type.startswith("image/"):
            detail = resp.text[:200] if resp.text else f"HTTP {resp.status_code}"
            raise RuntimeError(f"Pollinations unavailable: {detail}")
        return resp.content, content_type.split(";")[0].strip()


def generate_image_bytes(prompt: str, *, use_cache: bool = True) -> Tuple[bytes, str]:
    """Generate (or load cached) image bytes for a prompt."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("Image prompt is required")

    if use_cache:
        cached = _cache_path(prompt)
        if os.path.isfile(cached):
            with open(cached, "rb") as f:
                return f.read(), "image/jpeg"

    errors: list[str] = []
    for name, generator in (
        ("huggingface", _generate_via_hf),
        ("pollinations", _generate_via_pollinations),
    ):
        try:
            data, media_type = generator(prompt)
            if use_cache:
                os.makedirs(GENERATED_DIR, exist_ok=True)
                with open(_cache_path(prompt), "wb") as f:
                    f.write(data)
            logger.info("[Image] Generated via %s (%d bytes)", name, len(data))
            return data, media_type
        except Exception as exc:
            logger.warning("[Image] %s failed: %s", name, exc)
            errors.append(f"{name}: {exc}")

    raise RuntimeError("Image generation failed. " + "; ".join(errors))


async def generate_image_bytes_async(prompt: str, *, use_cache: bool = True) -> Tuple[bytes, str]:
    """Async wrapper — HF client is sync, so run in a thread."""
    import asyncio

    return await asyncio.to_thread(generate_image_bytes, prompt, use_cache=use_cache)
