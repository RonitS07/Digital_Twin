from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from groq import Groq, BadRequestError
from gtts import gTTS
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional, Tuple
import io
import logging

from core.config import settings
from db.database import get_db
from db.models import User
from security.auth import get_current_user
from services.voice_process import HALLUCINATIONS, process_voice_command
from services.speech_normalize import normalize_spoken_symbols

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai")

groq_client = Groq(api_key=settings.GROQ_API_KEY or "no-groq-key-provided")


class VoiceHistoryMessage(BaseModel):
    role: str
    content: str


class VoiceProcessRequest(BaseModel):
    text: str
    history: Optional[List[VoiceHistoryMessage]] = []
    pending_action: Optional[Dict[str, Any]] = None


def _detect_audio_format(data: bytes, filename: str = "") -> Tuple[str, str]:
    """Return (filename, content_type) from magic bytes."""
    if len(data) >= 4 and data[:4] == b"\x1a\x45\xdf\xa3":
        return "recording.webm", "audio/webm"
    if len(data) >= 8 and data[4:8] == b"ftyp":
        return "recording.m4a", "audio/mp4"
    if len(data) >= 4 and data[:4] == b"RIFF":
        return "recording.wav", "audio/wav"
    if data[:3] == b"ID3" or (len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        return "recording.mp3", "audio/mpeg"
    if filename.endswith(".wav"):
        return "recording.wav", "audio/wav"
    if filename.endswith(".mp4") or filename.endswith(".m4a"):
        return "recording.m4a", "audio/mp4"
    return "recording.webm", "audio/webm"


def _transcribe_bytes(audio_bytes: bytes, filename: str = "") -> str:
    name, content_type = _detect_audio_format(audio_bytes, filename)

    if name.endswith(".webm") and audio_bytes[:4] != b"\x1a\x45\xdf\xa3":
        logger.warning("STT: invalid webm header (%d bytes)", len(audio_bytes))
        return ""

    file_obj = io.BytesIO(audio_bytes)
    file_obj.name = name

    transcription = groq_client.audio.transcriptions.create(
        file=(name, file_obj, content_type),
        model="whisper-large-v3-turbo",
        language="en",
        response_format="text",
        temperature=0.0,
        prompt=(
            "AETHER assistant. Transcribe emails with @ and . symbols, "
            "not the words at or dot."
        ),
    )

    if isinstance(transcription, str):
        return transcription.strip()
    return (getattr(transcription, "text", None) or str(transcription)).strip()


# ── STT endpoint ─────────────────────────────────────────────
@router.post("/stt")
async def speech_to_text(audio: UploadFile = File(...)):
    """Receives webm/wav/mp4 audio blob, returns transcript."""
    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured in backend settings")

    audio_bytes = await audio.read()
    filename = audio.filename or ""

    if len(audio_bytes) < 1500:
        return {"transcript": "", "error": "audio too short"}

    try:
        result = normalize_spoken_symbols(_transcribe_bytes(audio_bytes, filename))

        if result.lower().rstrip(".") in HALLUCINATIONS or len(result) < 3:
            return {"transcript": ""}

        return {"transcript": result}

    except BadRequestError as e:
        logger.warning("Groq STT 400: %s (%d bytes, file=%s)", e, len(audio_bytes), filename)
        return {"transcript": "", "error": "stt_format_error"}
    except Exception as e:
        logger.exception("Groq STT failed: %s", e)
        return {"transcript": "", "error": "stt_failed"}


# ── Voice intent + action endpoint ───────────────────────────
@router.post("/voice/process")
async def voice_process(
    payload: VoiceProcessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_text = normalize_spoken_symbols((payload.text or "").strip())
    if not user_text:
        raise HTTPException(status_code=400, detail="No text provided")

    history = [
        {"role": m.role, "content": m.content}
        for m in (payload.history or [])
        if m.role in ("user", "assistant") and m.content
    ]

    try:
        return await process_voice_command(
            db=db,
            user_id=current_user.id,
            user_text=user_text,
            history=history,
            pending_action=payload.pending_action,
        )
    except Exception as e:
        from llm.client import is_rate_limited, user_facing_llm_error
        logger.exception("Voice process failed: %s", e)
        spoken = user_facing_llm_error(e) if is_rate_limited(e) else (
            "Sorry, something went wrong. Please try again."
        )
        return {
            "spoken_response": spoken,
            "intent": "general_chat",
            "intent_hint": "Processing…",
            "action_taken": False,
            "pending_confirmation": False,
            "pending_action": None,
            "contact_options": None,
            "action_result": None,
        }


# ── TTS endpoint ─────────────────────────────────────────────
@router.post("/tts")
async def text_to_speech(payload: dict):
    """Receives text, returns MP3 audio stream."""
    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        tts = gTTS(text=text, lang="en", slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)

        return StreamingResponse(
            audio_buffer,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=reply.mp3"},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
