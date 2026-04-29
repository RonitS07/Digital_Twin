import os
import requests
import httpx
import logging
import asyncio

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

def send_telegram_message(chat_id: str, text: str):
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set, skipping Telegram message.")
        return False
    
    # 🟢 Guard: Skip empty messages
    if not text or not text.strip():
        logger.warning("Telegram send skipped: empty message body")
        return False
    
    safe_text = text.strip()
    
    if len(safe_text) > 4000:
        safe_text = safe_text[:3900] + "\n\n... (Truncated)"

    # Try Markdown first
    payload = {"chat_id": chat_id, "text": safe_text, "parse_mode": "Markdown"}
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    
    try:
        response = requests.post(url, json=payload, timeout=15)
        
        # If Markdown fails (status 400), try HTML
        if response.status_code == 400:
            payload["parse_mode"] = "HTML"
            response = requests.post(url, json=payload, timeout=15)
            
        # If HTML fails, try Plain Text
        if response.status_code == 400:
            payload.pop("parse_mode", None)
            response = requests.post(url, json=payload, timeout=15)
            
        if response.status_code != 200:
            logger.error(f"Telegram API Final Error: {response.status_code} - {response.text}")
            return False
            
        return True
    except Exception as e:
        logger.error(f"Error sending Telegram message: {e}")
        return False

def send_telegram_photo(chat_id: str, photo_url: str, caption: str = None):
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set, skipping Telegram photo.")
        return False
    
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
    
    try:
        image_bytes = None
        
        # Case A: Base64 Data URL
        if photo_url.startswith("data:"):
            import base64
            header, encoded = photo_url.split(",", 1)
            image_bytes = base64.b64decode(encoded)
        
        # Case B: External URL (Fetch it first for reliability)
        else:
            img_res = requests.get(photo_url, timeout=15)
            img_res.raise_for_status()
            image_bytes = img_res.content

        # Send as Multipart Form Data
        import io
        files = {"photo": ("image.jpg", io.BytesIO(image_bytes), "image/jpeg")}
        payload = {"chat_id": chat_id}
        if caption:
            payload["caption"] = caption
            
        response = requests.post(url, data=payload, files=files, timeout=25)
        
        if response.status_code != 200:
            logger.error(f"Telegram Photo API Error: {response.status_code} - {response.text}")
            return False
            
        return True
    except Exception as e:
        logger.error(f"Error in send_telegram_photo: {e}")
        return False

async def get_telegram_updates(offset=None):
    if not TELEGRAM_BOT_TOKEN:
        return []
    
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates"
    params = {"timeout": 30, "offset": offset}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=35.0)
            response.raise_for_status()
            return response.json().get("result", [])
    except (httpx.ConnectError, httpx.ConnectTimeout):
        # Don't spam errors on every poll if internet is unstable
        logger.warning("🌐 Telegram Updates: Connectivity issue (DNS/Network).")
        return []
    except asyncio.CancelledError:
        logger.info("[Telegram] Polling task cancelled during shutdown.")
        raise
    except Exception as e:
        # Ignore "RemoteProtocolError" often seen during fast reloads
        if "RemoteProtocolError" not in str(e):
            logger.error(f"Error getting Telegram updates: {e}")
        return []
