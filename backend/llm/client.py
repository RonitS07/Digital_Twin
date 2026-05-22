"""
LLM Client — unified interface for text, vision, visualization,
and file-analysis calls across OpenRouter and Groq providers.
"""

import os
import logging
import time

from openai import OpenAI
from core.config import settings

logger = logging.getLogger(__name__)

# ─── Provider clients ────────────────────────────────────────────────────────

_openrouter_key = settings.OPENROUTER_API_KEY or os.getenv("OPENROUTER_API_KEY", "")
_groq_key = settings.GROQ_API_KEY or os.getenv("GROQ_API_KEY", "")

openrouter_client = (
    OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=_openrouter_key,
    )
    if _openrouter_key
    else None
)

groq_client = (
    OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=_groq_key,
    )
    if _groq_key
    else None
)

# ─── Extended model configuration ────────────────────────────────────────────

OPENROUTER_MODELS = {
    # Text tiers (existing)
    "fast":          "meta-llama/llama-3.1-8b-instruct:free",
    "smart":         "meta-llama/llama-3.3-70b-instruct:free",
    "flash":         "google/gemini-2.0-flash-exp:free",
    "fallback":      "mistralai/mistral-7b-instruct:free",

    # Specialized tiers (new)
    "vision":        "google/gemini-2.0-flash-exp:free",
    "vision_alt":    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "vision_doc":    "qwen/qwen2-vl-7b-instruct:free",
    "visualization": "google/gemini-2.0-flash-exp:free",
    "reasoning":     "deepseek/deepseek-r1:free",
    "long_context":  "google/gemini-2.0-flash-exp:free",
}

GROQ_MODELS = {
    # Text tiers (existing)
    "fast":          "llama-3.1-8b-instant",
    "smart":         "llama-3.3-70b-versatile",
    "flash":         "llama-3.1-8b-instant",
    "fallback":      "llama-3.1-8b-instant",

    # Specialized tiers — Groq fallbacks
    # Groq has NO vision models currently
    # These fall back to best available text model
    "vision":        None,  # No vision on Groq
    "vision_alt":    None,
    "vision_doc":    None,
    "visualization": "llama-3.3-70b-versatile",
    "reasoning":     "llama-3.3-70b-versatile",
    "long_context":  "llama-3.1-8b-instant",
}


# ─── Core text chat function ─────────────────────────────────────────────────

def chat_complete(
    messages: list[dict],
    tier: str = "smart",
    temperature: float = 0.3,
    max_tokens: int = 2048,
    force_provider: str | None = None,
) -> str:
    """
    Send a chat completion request.

    Args:
        messages: list of {role, content} dicts
        tier: model tier key from the model dicts
        temperature: 0.0–1.0
        max_tokens: max response tokens
        force_provider: "openrouter" | "groq" | None (auto)

    Returns:
        The assistant's response text.
    """
    providers = _build_provider_order(tier, force_provider)

    last_error = None
    for provider_name, client, model in providers:
        if client is None or model is None:
            continue
        try:
            logger.info(
                f"[LLM] {provider_name} / {model} "
                f"(tier={tier})"
            )
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content
            if content:
                return content.strip()
        except Exception as e:
            last_error = e
            logger.warning(
                f"[LLM] {provider_name}/{model} failed: "
                f"{e}"
            )
            # Rate-limit backoff
            if "429" in str(e):
                time.sleep(2)
            continue

    # All providers failed — raise
    raise RuntimeError(
        f"All LLM providers failed for tier={tier}. "
        f"Last error: {last_error}"
    )


def _build_provider_order(tier, force_provider):
    """Build ordered list of (name, client, model) to try."""
    providers = []

    if force_provider == "groq":
        providers.append((
            "groq",
            groq_client,
            GROQ_MODELS.get(tier, GROQ_MODELS["fast"]),
        ))
        return providers

    if force_provider == "openrouter":
        providers.append((
            "openrouter",
            openrouter_client,
            OPENROUTER_MODELS.get(
                tier, OPENROUTER_MODELS["fast"]
            ),
        ))
        return providers

    # Auto: prefer Groq for speed, fall back to OpenRouter
    groq_model = GROQ_MODELS.get(tier)
    or_model = OPENROUTER_MODELS.get(
        tier, OPENROUTER_MODELS["fast"]
    )

    if groq_model and groq_client:
        providers.append(("groq", groq_client, groq_model))
    if or_model and openrouter_client:
        providers.append((
            "openrouter", openrouter_client, or_model
        ))
    # Ultimate fallback
    if not providers:
        if groq_client:
            providers.append((
                "groq", groq_client, GROQ_MODELS["fast"]
            ))
        if openrouter_client:
            providers.append((
                "openrouter",
                openrouter_client,
                OPENROUTER_MODELS["fast"],
            ))

    return providers


# ─── Vision chat function (new) ───────────────────────────────────────────────

def chat_complete_vision(
    text_prompt: str,
    image_source: str,
    image_type: str = "url",
    tier: str = "vision",
    temperature: float = 0.2,
    max_tokens: int = 1500,
) -> str:
    """
    Multimodal LLM call — accepts text + image.

    Args:
        text_prompt: instruction text
        image_source: URL string if image_type="url",
                      base64 string if image_type="base64"
        image_type: "url" | "base64"
        tier: "vision" | "vision_alt" | "vision_doc"
        temperature: 0.0–1.0
        max_tokens: max response tokens

    Returns:
        String description/analysis of the image.

    Raises:
        RuntimeError if no vision provider available.
    """
    model = OPENROUTER_MODELS.get(
        tier, OPENROUTER_MODELS["vision"]
    )

    # Build image content block
    if image_type == "url":
        image_content = {
            "type": "image_url",
            "image_url": {
                "url": image_source,
                "detail": "high"
            }
        }
    elif image_type == "base64":
        # Detect media type from base64 header or default
        media_type = "image/png"
        if image_source.startswith("/9j/"):
            media_type = "image/jpeg"
        elif image_source.startswith("iVBORw"):
            media_type = "image/png"
        elif image_source.startswith("R0lGOD"):
            media_type = "image/gif"
        elif image_source.startswith("UklGR"):
            media_type = "image/webp"

        image_content = {
            "type": "image_url",
            "image_url": {
                "url": (
                    f"data:{media_type};base64,"
                    f"{image_source}"
                ),
                "detail": "high"
            }
        }
    else:
        raise ValueError(
            f"Unknown image_type: {image_type}"
        )

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": text_prompt},
                image_content
            ]
        }
    ]

    # Vision only works on OpenRouter
    # (Groq has no vision models)
    if not openrouter_client:
        raise RuntimeError(
            "Vision requires OpenRouter. "
            "Set OPENROUTER_API_KEY."
        )

    # Try primary vision model, then alternates
    vision_models_to_try = [
        OPENROUTER_MODELS["vision"],
        OPENROUTER_MODELS["vision_alt"],
        OPENROUTER_MODELS["vision_doc"],
    ]
    # Remove duplicates while preserving order
    seen = set()
    vision_models_to_try = [
        m for m in vision_models_to_try
        if m and not (m in seen or seen.add(m))
    ]

    last_error = None
    for vision_model in vision_models_to_try:
        try:
            logger.info(
                f"[LLM Vision] Trying {vision_model}"
            )
            response = openrouter_client \
                .chat.completions.create(
                    model=vision_model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
            content = response.choices[0].message.content
            if content:
                logger.info(
                    f"[LLM Vision] ✓ {vision_model}"
                )
                return content
        except Exception as e:
            last_error = e
            logger.warning(
                f"[LLM Vision] {vision_model} failed:"
                f" {e}"
            )
            continue

    raise RuntimeError(
        f"All vision models failed. "
        f"Last error: {last_error}"
    )


# ─── Visualization function (new) ────────────────────────────────────────────

VISUALIZATION_SYSTEM_PROMPT = """
You are a data visualization expert. Your job is to
generate chart data as clean JSON.

CRITICAL RULES:
1. Output ONLY valid JSON — no markdown, no explanation,
   no backticks, no preamble
2. Use real-world data provided in the [USER REQUEST] or [CHAT HISTORY] if available.
3. IF NO REAL DATA IS PROVIDED, YOU MUST GENERATE REALISTIC DEMONSTRATION DATA. Never return an empty chart.
4. Set "data_source": "factual" or "demonstration".
5. The JSON must match this exact schema:
   {
     "chart_type": "bar"|"line"|"pie"|"scatter"|"area",
     "title": "string",
     "subtitle": "string (empty if none)",
     "data_source": "factual"|"demonstration",
     "disclaimer": "string (empty if no issues, or note that data is demonstration)",
     "labels": ["label1", "label2", ...],
     "datasets": [
       {
         "label": "series name",
         "data": [number, number, ...]
       }
     ],
     "x_axis_label": "string",
     "y_axis_label": "string",
     "insights": ["insight 1", "insight 2", "insight 3"]
   }
"""


def chat_complete_visualization(
    user_request: str,
    context_data: str = "",
    chat_history: str = "",
    temperature: float = 0.1,
    max_tokens: int = 2000,
) -> dict:
    """
    Generates chart data as structured JSON.
    Uses the best reasoning model available.

    The output is transformed to match the format
    expected by the frontend VisualizationRenderer:
      { chart_type, title, description, disclaimer,
        x_key, y_keys, data, insights }

    Args:
        user_request: what the user wants to visualize
        context_data: any real data to use (optional)
        temperature: low = more deterministic JSON
        max_tokens: chart data can be verbose

    Returns:
        Parsed dict with chart configuration.
        Always has "data_source" and "disclaimer" fields.
    """
    user_content = user_request
    if chat_history:
        user_content = f"[CHAT HISTORY]\n{chat_history}\n\n[USER REQUEST]\n{user_content}"
    if context_data:
        user_content = (
            f"Use this real data for the visualization:\n\n{context_data}\n\n"
            f"Visualization request: {user_content}"
        )

    messages = [
        {
            "role": "system",
            "content": VISUALIZATION_SYSTEM_PROMPT
        },
        {
            "role": "user",
            "content": user_content
        }
    ]

    raw = chat_complete(
        messages=messages,
        tier="visualization",
        temperature=temperature,
        max_tokens=max_tokens,
    )

    # Parse JSON response
    import json
    import re

    # Strip any markdown fences if model added them
    clean = re.sub(
        r'```(?:json)?\n?', '', raw
    ).strip().rstrip('`').strip()

    try:
        data = json.loads(clean)
    except json.JSONDecodeError as e:
        logger.error(
            f"[LLM Viz] JSON parse failed: {e}"
            f"\nRaw: {raw[:200]}"
        )
        # Return safe fallback
        data = {
            "chart_type": "bar",
            "title": "Data Unavailable",
            "subtitle": "",
            "data_source": "factual",
            "disclaimer": (
                "Could not generate chart data."
            ),
            "labels": ["Error"],
            "datasets": [{"label": "Value", "data": [0]}],
            "x_axis_label": "",
            "y_axis_label": "",
            "insights": [
                "Could not generate chart data. Please provide specific data."
            ]
        }

    # ── Transform to VisualizationRenderer format ─────
    # The frontend renderer expects:
    #   x_key, y_keys: [{key, label, color}], data: [{}]
    # The LLM returns:
    #   labels, datasets: [{label, data}]
    transformed = _transform_viz_data(data)

    logger.info(
        f"[LLM Viz] Chart generated: "
        f"type={transformed.get('chart_type')} "
        f"source={data.get('data_source')}"
    )
    return transformed


# Chart palette matching VisualizationRenderer
_VIZ_COLORS = [
    '#6366f1', '#a855f7', '#10b981', '#f59e0b',
    '#3b82f6', '#ef4444', '#06b6d4', '#ec4899',
]


def _transform_viz_data(raw: dict) -> dict:
    """
    Transform LLM output (labels+datasets) into the
    format the frontend VisualizationRenderer expects
    (x_key + y_keys + flat data array).
    """
    labels = raw.get("labels", [])
    datasets = raw.get("datasets", [])
    chart_type = raw.get("chart_type", "bar")

    # Build y_keys
    y_keys = []
    for i, ds in enumerate(datasets):
        key = ds.get("label", f"series_{i}")
        # Sanitise key for use as object property
        safe_key = key.replace(" ", "_").replace(
            "/", "_"
        )
        y_keys.append({
            "key": safe_key,
            "label": key,
            "color": _VIZ_COLORS[i % len(_VIZ_COLORS)],
        })

    # Build flat data array
    flat_data = []
    if chart_type == "pie":
        # Pie chart: needs {name, value} format
        for j, label in enumerate(labels):
            point = {"name": label}
            if datasets:
                point["value"] = (
                    datasets[0]["data"][j]
                    if j < len(datasets[0].get("data", []))
                    else 0
                )
            flat_data.append(point)
    else:
        # Bar/line/area/scatter: {name, key1, key2, ...}
        for j, label in enumerate(labels):
            point = {"name": label}
            for i, ds in enumerate(datasets):
                safe_key = y_keys[i]["key"]
                point[safe_key] = (
                    ds["data"][j]
                    if j < len(ds.get("data", []))
                    else 0
                )
            flat_data.append(point)

    return {
        "chart_type": chart_type,
        "title": raw.get("title", ""),
        "description": raw.get("subtitle", ""),
        "disclaimer": raw.get("disclaimer", ""),
        "data_source": raw.get("data_source", "illustrative"),
        "x_key": "name",
        "y_keys": y_keys,
        "data": flat_data,
        "insights": raw.get("insights", []),
    }


# ─── File analysis function (new) ────────────────────────────────────────────

def analyze_file_content(
    file_content: str,
    file_type: str,
    user_request: str,
    chat_history: str = "",
    file_path: str = "",
) -> str:
    """
    Semantically analyzes file content.
    Chooses the right model based on content length
    and file type.

    Args:
        file_content: extracted text from file
        file_type: "pdf" | "docx" | "csv" | "txt"
                   | "image"
        user_request: what the user wants to know
        file_path: original path (for logging)

    Returns:
        Analysis/summary string.
    """
    content_length = len(file_content)
    logger.info(
        f"[LLM File] Analyzing {file_type} file, "
        f"{content_length} chars"
    )

    # Choose tier based on content length
    # Long documents need long context model
    if content_length > 30000:
        tier = "long_context"  # gemini 1M context
    elif file_type in ("csv",):
        tier = "smart"  # reasoning for data files
    else:
        tier = "smart"  # quality for summarization

    # Cap content to avoid token overflow
    # Gemini handles 1M tokens but we cap at ~500k chars
    # to avoid slow responses
    max_content_chars = 500000
    if content_length > max_content_chars:
        file_content = (
            file_content[:max_content_chars]
            + f"\n\n[... truncated at {max_content_chars}"
            f" chars. Full document is "
            f"{content_length} chars ...]"
        )

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert document analyst. "
                "Analyze the provided file content "
                "and answer the user's request "
                "accurately and concisely. "
                "Base your analysis ONLY on the "
                "content provided — do not invent "
                "or assume information not present."
            )
        },
        {
            "role": "user",
            "content": (
                (f"[CHAT HISTORY]\n{chat_history}\n\n" if chat_history else "") +
                f"File type: {file_type.upper()}\n"
                f"User request: {user_request}\n\n"
                f"File content:\n{file_content}"
            )
        }
    ]

    return chat_complete(
        messages=messages,
        tier=tier,
        temperature=0.2,
        max_tokens=2000,
    )


# ─── Image file analysis (new) ───────────────────────────────────────────────

async def analyze_image_file(
    file_path: str,
    user_request: str,
) -> str:
    """
    Analyzes an image file using vision model.
    Converts file to base64 and sends to vision API.

    Args:
        file_path: local path to image file
        user_request: what user wants to know

    Returns:
        Vision model description/analysis.
    """
    import base64

    if not os.path.exists(file_path):
        return f"File not found: {file_path}"

    # Read and encode image
    with open(file_path, "rb") as f:
        image_bytes = f.read()
    image_b64 = base64.b64encode(image_bytes).decode()

    # Detect type
    ext = os.path.splitext(file_path)[1].lower()
    type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    media_type = type_map.get(ext, "image/png")

    prompt = (
        f"Analyze this image and respond to: "
        f"{user_request}\n\n"
        "Be specific and accurate. Describe what you "
        "actually see — do not guess or assume."
    )

    try:
        return chat_complete_vision(
            text_prompt=prompt,
            image_source=image_b64,
            image_type="base64",
            tier="vision",
        )
    except RuntimeError as e:
        logger.error(f"[LLM Vision] File analysis: {e}")
        return (
            f"I can see this is a "
            f"{ext[1:].upper()} image file "
            f"({len(image_bytes) // 1024}KB) "
            f"but vision analysis is currently "
            f"unavailable. "
            f"Please ensure OPENROUTER_API_KEY is set."
        )
