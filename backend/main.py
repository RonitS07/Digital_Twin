import os
import re
import time
import uuid
import asyncio
import secrets
import logging
import httpx
from typing import Optional, List, Union
from datetime import datetime, timedelta
import json
import requests
import base64

from dotenv import load_dotenv
load_dotenv()
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"

# Root directory of the backend — used for all file storage paths
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, validator
import json
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi.responses import RedirectResponse, StreamingResponse, HTMLResponse
from googleapiclient.errors import HttpError

from db.database import get_db, engine
from db.models import Base, User, TaskLog, ProcessedEmail, OAuthState, IntegrationToken, StructuredMemory, FileAsset
from db.auth import hash_password, verify_password, create_access_token, decode_token
from tools.gmail_tool import read_recent_emails, draft_email, send_email, reply_to_email, get_email_details, send_styled_invite, download_attachment
from tools.calendar_tool import get_upcoming_events, create_event, normalize_datetime
from utils.email_templates import get_invite_html
from tools.google_oauth import (
    build_flow,
    upsert_google_tokens,
    is_connected,
    is_scope_sufficient,
    GMAIL_SCOPES,
    CALENDAR_SCOPES,
)
from tools.slack_tool import upsert_slack_tokens, is_slack_connected, list_slack_channels, send_slack_message, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_URI
from graph.graph import twin_graph
from graph.nodes import triage_email, EMAIL_CATEGORIES_REQUIRING_REPLY
from memory.chroma import store_memory
from memory.learning import learn_from_interaction
from tools.telegram_tool import send_telegram_message, get_telegram_updates, send_telegram_photo
from utils.briefing import generate_daily_briefing
from graph.llm_utils import _llm

# ── Multi-agent / A2A imports ──────────────────────────────────────────────
from db.models import Base, User, TaskLog, ProcessedEmail, OAuthState, IntegrationToken, StructuredMemory, AgentRegistry, A2AMessageLog
from routers.agent_broker import router as agent_broker_router, set_auth_dependency
from services.agent_registry import register_agent

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global background task registry for clean shutdown
background_tasks = set()

Base.metadata.create_all(bind=engine)

security = HTTPBearer(auto_error=False)

app = FastAPI(title="AI Twin API")

def _get_allowed_origins() -> list:
    """Build CORS allowed origins from env so ngrok/prod domains are always included."""
    origins = {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:8000",
    }
    for env_var in ("FRONTEND_URL", "NGROK_URL"):
        val = os.getenv(env_var)
        if val:
            origins.add(val.rstrip("/"))
            
    # Add Vercel domain to avoid CORS blocks
    origins.add("https://digital-twin-ten-sand.vercel.app")
    
    return list(origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add COOP and COEP headers to allow popups to communicate back to the main window."""
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    # COEP: credentialless or require-corp? require-corp is safer but stricter.
    # For now same-origin-allow-popups is primarily what solves the blocking issue.
    return response

# Mount multi-agent broker router
app.include_router(agent_broker_router)

def extract_reply(text: str) -> str:
    """Extracts reply content and strips away hidden action tags and internal reasoning."""
    # First priority: <reply> tags
    match = re.search(r'<reply>(.*?)</reply>', text, re.DOTALL | re.IGNORECASE)
    if match:
        content = match.group(1).strip()
    else:
        content = text.strip()
    
    # Strip well-formed AND malformed action tags
    content = re.sub(r'<?/?action>.*?(?:</action>|$)', '', content, flags=re.DOTALL | re.IGNORECASE)
    
    # Strip markdown JSON blocks
    content = re.sub(r'```json.*?```', '', content, flags=re.DOTALL | re.IGNORECASE)
    
    # Strip common AI reasoning/step-by-step headers
    content = re.sub(r'(?i)\*\*Step \d+:.*?\*\*', '', content)
    content = re.sub(r'(?i)^Step \d+:.*$', '', content, flags=re.MULTILINE)
    
    # Strip "Source:" or "[CONTEXT DATA]" footnotes
    content = re.sub(r'(?i)\*\*Source:\*\*.*$', '', content, flags=re.DOTALL)
    content = re.sub(r'(?i)Based on the provided \[CONTEXT DATA\].*$', '', content, flags=re.DOTALL)
    
    # Strip any dangling JSON payload
    content = re.sub(r'\s*\{\s*"intent"\s*:.*$', '', content, flags=re.DOTALL | re.IGNORECASE)
    
    return content.strip()

# Setup Background Task
AUTO_SEND = os.getenv("AUTO_SEND", "false").lower() == "true"

def process_new_emails():
    """Shared logic to check and process new emails for all connected users."""
    processed_count = 0
    try:
        with next(get_db()) as db:
            # Find all users who have active Google integrations
            connected_user_ids = (
                db.query(IntegrationToken.user_id)
                .filter(IntegrationToken.provider == "google")
                .distinct()
                .all()
            )
            if not connected_user_ids:
                return False

            for (uid,) in connected_user_ids:
                try:
                    if not is_connected(db=db, user_id=uid):
                        continue
                    if not is_scope_sufficient(db=db, user_id=uid, scopes=GMAIL_SCOPES):
                        continue
                    
                    user = db.query(User).filter(User.id == uid).first()
                    emails = read_recent_emails(db=db, user_id=uid, max_results=5)

                    for email in emails:
                        existing = db.query(ProcessedEmail).filter(ProcessedEmail.id == email["id"]).first()
                        if existing:
                            continue
                            
                        # 1. Fetch Full Details (for content extraction)
                        info = get_email_details(db=db, user_id=uid, message_id=email["id"])
                        body_excerpt = info["body"][:800]  # Keep short to stay under Groq TPM limits
                        
                        # 2. Mark as processed
                        entry = ProcessedEmail(
                            id=email["id"], 
                            user_id=uid,
                            thread_id=email.get("threadId", ""), 
                            action_taken="init"
                        )
                        db.add(entry)
                        db.commit()

                        # 3. Semantic Memory Indexing (Chroma)
                        store_memory(
                            user_id=uid,
                            doc_id=f"email_{email['id']}",
                            content=f"Email from: {info['from']}\nSubject: {info['subject']}\nBody: {info['body']}",
                            type="email",
                            metadata={"from": info["from"], "subject": info["subject"]}
                        )

                        # 4. Proactive Attachment Handling
                        if info.get("attachments"):
                            for att in info["attachments"]:
                                try:
                                    content = download_attachment(db=db, user_id=uid, message_id=email["id"], attachment_id=att["id"])
                                    filename = f"email_{email['id']}_{att['filename']}"
                                    save_path = os.path.join("uploads", filename)
                                    full_path = os.path.join(BACKEND_DIR, save_path)
                                    
                                    with open(full_path, "wb") as f:
                                        f.write(content)
                                    
                                    asset = FileAsset(
                                        user_id=uid,
                                        name=att["filename"],
                                        file_type=att["mimeType"],
                                        size=att.get("size", 0),
                                        storage_path=save_path
                                    )
                                    db.add(asset)
                                except Exception as att_e:
                                    logger.error(f"Failed to process attachment {att['filename']}: {att_e}")

                        # 5. Advanced Intelligence: Action & Entity Extraction
                        intel_result = _llm(
                            system="""Analyze the incoming email. 
1. Determine if any action is required from the user (e.g. 'Review this', 'Join meeting', 'Pay bill').
2. Extract important entities like tracking numbers, flight codes, zoom links, or dates.
Return ONLY valid JSON: {"action_item": "null or string", "entities": [{"key":"tracking_number", "value":"123"}]}""",
                            user=f"From: {info['from']}\nSubject: {info['subject']}\nBody: {body_excerpt}",
                            force_fast=True
                        )
                        
                        try:
                            intel = json.loads(intel_result)
                            action_item = intel.get("action_item")
                            if action_item and action_item != "null":
                                task = TaskLog(
                                    user_id=uid,
                                    input=f"Action detected from email: {info['subject']}",
                                    intent="email_action",
                                    output=f"Pending Task: {action_item}\n\nEmail from: {info['from']}",
                                    kind="approval",
                                    metadata_json=json.dumps({"email_id": email["id"], "action": action_item})
                                )
                                db.add(task)
                                if user and user.telegram_enabled:
                                    send_telegram_message(user.telegram_chat_id, f"⚠️ *Action Required from Email*\n\n{action_item}")
                            
                            for entity in intel.get("entities", []):
                                memory = StructuredMemory(
                                    user_id=uid,
                                    category="reference",
                                    key=entity["key"],
                                    value=entity["value"],
                                    source=f"email_{email['id']}"
                                )
                                db.merge(memory)
                        except Exception as intel_e:
                            logger.error(f"Intelligence extraction failed: {intel_e}")

                        # 6. SMART TRIAGE — only draft replies for emails that need one
                        triage = triage_email(
                            subject=info["subject"],
                            sender=info["from"],
                            snippet=email.get("snippet", info["body"][:200])
                        )
                        category = triage.get("category", "informational")
                        needs_reply = triage.get("requires_reply", False)
                        
                        logger.info(f"[EmailTriage] {info['subject'][:50]} → {category} | reply_needed={needs_reply}")
                        
                        # Store the category in structured memory for dashboard display
                        try:
                            cat_mem = StructuredMemory(
                                user_id=uid,
                                category="reference",
                                key=f"email_category_{email['id'][:8]}",
                                value=f"{category}: {info['subject'][:60]}",
                                source=f"email_{email['id']}"
                            )
                            db.merge(cat_mem)
                        except Exception:
                            pass

                        if needs_reply and category in EMAIL_CATEGORIES_REQUIRING_REPLY:
                            # Auto-draft a reply for the user to review
                            try:
                                initial_state = {
                                    "user_id": uid,
                                    "user_name": user.name if user else "User",
                                    "input": f"Draft a professional reply to this email.",
                                    "intent": "email",
                                    "task_plan": [],
                                    "output": "",
                                    "chat_history": [],
                                    "approval_required": True,
                                    "context": f"EMAIL DETAILS:\nFrom: {info['from']}\nSubject: {info['subject']}\nBody: {info['body'][:1000]}"
                                }
                                res = twin_graph.invoke(initial_state)
                                clean_reply = extract_reply(res["output"])
                                if clean_reply.strip():
                                    draft_email(db=db, user_id=uid, to=info["from"], subject=f"Re: {info['subject']}", body=clean_reply)
                                    entry.action_taken = "drafted"
                                    logger.info(f"[EmailMonitor] Auto-drafted reply for: {info['subject'][:50]}")
                            except Exception as draft_e:
                                logger.error(f"Auto-draft failed: {draft_e}")
                                entry.action_taken = "indexed"
                        else:
                            entry.action_taken = f"indexed:{category}"
                            logger.info(f"[EmailMonitor] Indexed (no draft): {info['subject'][:50]} [{category}]")

                        db.commit()
                        processed_count += 1
                        
                        # Synchronous sleep (this is a sync function run in a thread)
                        time.sleep(1)

                except Exception as user_err:
                    logger.error(f"Email Monitor Error for user {uid}: {user_err}")
                    continue
                
                # Sleep between users to reduce LLM rate limit pressure
                time.sleep(2)
    except Exception as e:
        logger.error(f"Email Monitor Error: {e}")
    return processed_count > 0

async def monitor_emails():
    try:
        while True:
            # Run the heavy sync processing in a thread to keep event loop free
            await asyncio.to_thread(process_new_emails)
            await asyncio.sleep(600)
    except asyncio.CancelledError:
        logger.info("[Monitor] Email monitor stopping...")
        raise

async def monitor_telegram():
    """Polls Telegram for new messages and processes them."""
    try:
        offset = None
        while True:
            try:
                updates = await get_telegram_updates(offset=offset)
                for update in updates:
                    offset = update["update_id"] + 1
                    msg = update.get("message")
                    if not msg:
                        continue
                    
                    chat_id = str(msg["chat"]["id"])
                    text = msg.get("text", "")
                    
                    with next(get_db()) as db:
                        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
                        if not user:
                            if text.startswith("/start"):
                                send_telegram_message(chat_id, "Welcome to AI Twin! Please connect your account in the dashboard settings to start using Telegram features.")
                            continue
                        
                        if text == "/help":
                            help_msg = """
🤖 *AI Twin Telegram Commands*

📅 *Intelligence*
/briefing \- Get your 24\-hour executive report
/schedule \- View today's full agenda
/unread \- See your most recent unread emails

✍️ *Automation (Send any message)*
• "Draft an email to ronit@example.com about the project"
• "What meetings do I have tomorrow afternoon?"
• "Create a 3D render of a futuristic office"
• "Search the web for latest AI news"

💡 *Tip*: You can speak to your AI Twin naturally just like you do on the dashboard!
"""
                            send_telegram_message(chat_id, help_msg)
                            continue

                        if text == "/unread":
                            emails = read_recent_emails(db, user.id, max_results=5)
                            if not emails:
                                send_telegram_message(chat_id, "No new unread emails in the last 24 hours.")
                            else:
                                msg = "📩 *Recent Unread Emails*\n\n"
                                for e in emails:
                                    msg += f"• *{e['subject']}*\n  From: {e['from']}\n\n"
                                send_telegram_message(chat_id, msg)
                            continue

                        if text == "/schedule":
                            events = get_upcoming_events(db, user.id, max_results=5)
                            if not events:
                                send_telegram_message(chat_id, "Your schedule is clear for the next 24 hours.")
                            else:
                                m = "📅 *Your Agenda*\n\n"
                                for e in events:
                                    try:
                                        dt = datetime.fromisoformat(e["start"].replace("Z", "+00:00"))
                                        ts = dt.strftime("%B %d, %I:%M %p")
                                    except Exception:
                                        ts = e["start"]
                                    m += f"• *{e['title']}*\n  Time: {ts}\n\n"
                                send_telegram_message(chat_id, m)
                            continue

                        if text == "/briefing":
                            briefing = generate_daily_briefing(db, user.id, user.name)
                            send_telegram_message(chat_id, briefing)
                            continue

                        # Process general message via AI Graph
                        prefs = {}
                        try:
                            prefs = json.loads(user.preferences_json or "{}")
                        except Exception:
                            pass
                        
                        initial_state = {
                            "user_id": user.id,
                            "user_name": user.name,
                            "input": text,
                            "chat_history": [],
                            "intent": "other",
                            "output": "",
                            "task_plan": [],
                            "approval_required": False,
                            "gmail_sync": prefs.get("gmailSync", True),
                            "calendar_sync": prefs.get("calendarSync", True)
                        }
                        res = twin_graph.invoke(initial_state)
                        clean_res = extract_reply(res["output"])
                        
                        if res.get("response_type") == "visual" and res.get("image_url"):
                            send_telegram_photo(chat_id, res["image_url"], clean_res)
                        else:
                            send_telegram_message(chat_id, clean_res)
                            
                        # Action Execution
                        if "<action>" in res["output"]:
                            try:
                                match = re.search(r"<action>(.*?)</action>", res["output"], re.DOTALL)
                                if match:
                                    action_data = json.loads(match.group(1))
                                    intent = action_data.get("intent")
                                    if intent == "email":
                                        if prefs.get("gmailSync") is not False:
                                            send_email(db, user.id, action_data["to"], action_data["subject"], action_data["body"])
                                            send_telegram_message(chat_id, "✅ *Email Sent Successfully*")
                                    elif intent == "calendar":
                                        if prefs.get("calendarSync") is not False:
                                            e_title = action_data.get("title") or action_data.get("summary") or "Untitled"
                                            # Support both field name conventions from LLM
                                            start_dt = action_data.get("start_datetime") or action_data.get("start")
                                            end_dt = action_data.get("end_datetime") or action_data.get("end")
                                            c_res = create_event(db=db, user_id=user.id, title=e_title, 
                                                               start_datetime=start_dt, 
                                                               end_datetime=end_dt)
                                            send_telegram_message(chat_id, f"📅 *Scheduled:* {e_title}")
                            except Exception as act_err:
                                logger.error(f"Telegram Action Error: {act_err}")

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Telegram Monitor Error: {e}")
            await asyncio.sleep(5)
    except asyncio.CancelledError:
        logger.info("[Monitor] Telegram monitor stopping...")
        raise

# TTL-based notified_events: {event_id: timestamp_notified}
# Entries expire after 24 hours so events are notifiable again on next occurrence
_NOTIFIED_EVENTS: dict = {}
_NOTIFIED_TTL_SECONDS = 86400  # 24 hours

def _is_already_notified(event_id: str) -> bool:
    ts = _NOTIFIED_EVENTS.get(event_id)
    if ts is None:
        return False
    if (datetime.now() - ts).total_seconds() > _NOTIFIED_TTL_SECONDS:
        _NOTIFIED_EVENTS.pop(event_id, None)
        return False
    return True

def _mark_notified(event_id: str):
    _NOTIFIED_EVENTS[event_id] = datetime.now()

def process_calendar_monitor():
    """Shared logic for checking calendar events."""
    try:
        with next(get_db()) as db:
            users = db.query(User).filter(User.telegram_enabled == True, User.telegram_chat_id.isnot(None)).all()
            for user in users:
                # Skip users without Google connection OR without calendar scopes
                if not is_connected(db=db, user_id=user.id):
                    continue
                if not is_scope_sufficient(db=db, user_id=user.id, scopes=CALENDAR_SCOPES):
                    logger.debug(f"[CalMonitor] Skipping user {user.id}: no calendar scopes granted.")
                    continue
                
                events = get_upcoming_events(db=db, user_id=user.id, max_results=10)
                now = datetime.now()
                
                for event in events:
                    event_id = event.get("id") or event.get("summary")
                    if _is_already_notified(event_id):
                        continue
                    
                    try:
                        start_str = event.get("start")
                        if not start_str:
                            continue
                        
                        # Parse start time
                        event_start = datetime.fromisoformat(start_str.replace("Z", "+00:00")).replace(tzinfo=None)
                        
                        # If meeting starts in the next 15 minutes
                        diff = event_start - now
                        if timedelta(minutes=0) < diff <= timedelta(minutes=15):
                            msg = f"⏰ *Upcoming Meeting Reminder*\n\n*What:* {event['summary']}\n*When:* {event_start.strftime('%I:%M %p')}\n"
                            if event.get('meet_link'):
                                msg += f"🔗 *Joint Meet:* {event['meet_link']}"
                            
                            send_telegram_message(user.telegram_chat_id, msg)
                            _mark_notified(event_id)
                    except Exception as e:
                        logger.error(f"Error checking event timing: {e}")
                        
    except Exception as e:
        err_msg = str(e)
        if "unable to find the server" in err_msg.lower() or "name resolution" in err_msg.lower():
            logger.warning("🌐 Calendar Monitor: Connectivity issue. Retrying later...")
        else:
            logger.error(f"Monitor Calendar Error: {e}")

async def monitor_calendar():
    """Polls for upcoming meetings and notifies the user on Telegram."""
    try:
        while True:
            await asyncio.to_thread(process_calendar_monitor)
            await asyncio.sleep(60) # Check every minute
    except asyncio.CancelledError:
        logger.info("[Monitor] Calendar monitor stopping...")
        raise

def process_daily_briefing():
    """Logic for daily briefing checks."""
    try:
        now = datetime.utcnow()
        # For simplicity, if it's been > 20 hours since last briefing, send a new one
        with next(get_db()) as db:
            users = db.query(User).filter(User.telegram_enabled == True, User.telegram_chat_id.isnot(None)).all()
            for user in users:
                # 🟢 Skip users without any active Google connection
                if not is_connected(db=db, user_id=user.id):
                    continue

                should_send = False
                if not user.last_briefing_at:
                    should_send = True
                elif now - user.last_briefing_at > timedelta(hours=20):
                    should_send = True
                
                if should_send:
                    logger.info(f"Generating scheduled briefing for {user.id}")
                    briefing = generate_daily_briefing(db, user.id, user.name)
                    # This will push a text message via Telegram
                    send_telegram_message(user.telegram_chat_id, briefing)
                    user.last_briefing_at = now
                    db.commit()
                    
                    # Small sleep between users to avoid Groq rate limits (Synchronous in thread)
                    time.sleep(2)
    except Exception as e:
        logger.error(f"Daily Briefing Task Error: {e}")

async def daily_briefing_task():
    """Checks every hour if a briefing needs to be sent."""
    try:
        while True:
            await asyncio.to_thread(process_daily_briefing)
            await asyncio.sleep(3600) # Check every hour
    except asyncio.CancelledError:
        logger.info("[Monitor] Briefing task stopping...")
        raise

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing AI Twin Background services...")
    
    # Track tasks for clean shutdown
    t1 = asyncio.create_task(monitor_emails())
    t2 = asyncio.create_task(monitor_telegram())
    t3 = asyncio.create_task(monitor_calendar())
    t4 = asyncio.create_task(daily_briefing_task())
    
    background_tasks.add(t1)
    background_tasks.add(t2)
    background_tasks.add(t3)
    background_tasks.add(t4)
    
    # Inject auth dependency into agent broker (avoids circular import)
    set_auth_dependency(get_current_user)
    logger.info("Startup complete.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Gracefully shutting down background tasks...")
    for task in background_tasks:
        task.cancel()
    
    await asyncio.gather(*background_tasks, return_exceptions=True)
    background_tasks.clear()
    logger.info("Shutdown complete.")

# Pydantic Schemas
class ProcessRequest(BaseModel):
    input: str
    user_id: str
    user_name: Optional[str] = None
    chat_history: List[dict] = Field(default_factory=list)
    session_id: Optional[str] = None
    gmail_sync: bool = True
    calendar_sync: bool = True
    slack_sync: bool = True
    files: Optional[List[dict]] = Field(default_factory=list) # [{ name, type, data }]

class MemoryRequest(BaseModel):
    user_id: str
    doc_id: str
    text: str

class EmailDraftRequest(BaseModel):
    to: str
    subject: str
    body: str

class EmailSendRequest(BaseModel):
    user_id: str
    to: str
    subject: str
    body: str

class TelegramSendRequest(BaseModel):
    user_id: str
    message: str
    image_url: Optional[str] = None

    class Config:
        extra = "ignore"

class EmailReplyRequest(BaseModel):
    message_id: str
    body: str

class CreateEventRequest(BaseModel):
    title: str
    start_datetime: str
    end_datetime: str
    attendees: Optional[Union[str, List[EmailStr]]] = []
    description: Optional[str] = ""
    location: Optional[str] = ""

    @validator('start_datetime', 'end_datetime')
    def validate_datetime(cls, v):
        try:
            normalize_datetime(v)
            return v
        except ValueError as e:
            raise ValueError(f"Invalid datetime format: {e}")


def _tool_error(message: str, code: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _map_google_http_error(e: HttpError) -> tuple[int, dict]:
    status = getattr(e, "status_code", None) or getattr(getattr(e, "resp", None), "status", None) or 500
    reason = ""
    try:
        reason = str(e)
    except Exception:
        reason = "Google API error"

    # Friendly mapping
    if status in (401, 403):
        return 403, {"code": "GOOGLE_PERMISSION_DENIED", "message": "Google denied permission. Please reconnect Google and re-approve access."}
    if status == 429:
        return 429, {"code": "GOOGLE_QUOTA", "message": "Google quota/rate limit hit. Please try again in a few minutes."}
    if 500 <= status < 600:
        return 502, {"code": "GOOGLE_UPSTREAM", "message": "Google service is temporarily unavailable. Please retry shortly."}
    
    # Check for connection/DNS issues
    error_str = str(e).lower()
    if "unable to find the server" in error_str or "temporary failure in name resolution" in error_str:
        return 503, {"code": "NETWORK_ERROR", "message": "Backend DNS/Network failure. Cannot reach Google services."}

    return 400, {"code": "GOOGLE_API_ERROR", "message": reason}

class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class FirebaseAuthRequest(BaseModel):
    uid: str
    email: Optional[str] = None
    name: Optional[str] = None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
        
    payload = decode_token(credentials.credentials)
    
    # Check for specific expiration error
    if payload and payload.get("error") == "ExpiredIdTokenError":
        raise HTTPException(
            status_code=401, 
            detail={"code": "REFRESH_REQUIRED", "message": "Token expired"}
        )
        
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found for token")
    return user

@app.get("/auth/gmail/status")
def gmail_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connected = is_connected(db=db, user_id=current_user.id)
    return {"connected": connected, "email": current_user.email if connected else None}


def _encode_oauth_state(user_id: str) -> str:
    """
    Generate a random state string to bind OAuth callback.
    """
    return secrets.token_hex(16)


def _decode_oauth_state(state: str, db: Session) -> Optional[str]:
    """
    Look up the user_id associated with a state in the DB.
    """
    record = db.query(OAuthState).filter(OAuthState.state == state).first()
    return record.user_id if record else None

def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or "sub" not in payload:
        return None
    return db.query(User).filter(User.id == payload["sub"]).first()


@app.get("/integrations/google/status")
def google_integration_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"connected": is_connected(db=db, user_id=current_user.id)}


@app.get("/oauth/google/start")
def google_oauth_start(
    request: Request,
    scopes: str = "gmail,calendar",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope_set = set([s.strip().lower() for s in scopes.split(",") if s.strip()])
    # 🟢 ALWAYS request both Gmail and Calendar for a complete experience
    selected_scopes = list(set(GMAIL_SCOPES + CALENDAR_SCOPES))
    if not selected_scopes:
        raise HTTPException(status_code=400, detail="No scopes selected")

    state = _encode_oauth_state(current_user.id)
    flow = build_flow(scopes=selected_scopes, state=state)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        code_challenge_method="S256",
    )

    # Save PKCE verifier, user_id, and scopes to database to survive the redirect
    if getattr(flow, "code_verifier", None):
        logger.debug(f"DEBUG: Saving verifier for state {state[:10]} (user={current_user.id})...")
        # Try to capture the frontend origin from query or referer to return correctly
        frontend_url = request.query_params.get("frontend_url") or "http://127.0.0.1:5173"
        try:
            db.add(OAuthState(
                state=state, 
                user_id=current_user.id,
                code_verifier=flow.code_verifier,
                scopes=" ".join(selected_scopes),
                frontend_origin=frontend_url
            ))
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning(f"Warning: Failed to save OAuth verifier: {e}")
    else:
        logger.debug("DEBUG: No code_verifier found on flow object")

    return {"auth_url": auth_url}


@app.post("/integrations/google/disconnect")
def google_disconnect(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(IntegrationToken).filter(IntegrationToken.user_id == current_user.id, IntegrationToken.provider == "google").delete()
    db.commit()
    return {"status": "success"}


@app.get("/oauth/google/callback")
def google_oauth_callback(code: str, state: str, db: Session = Depends(get_db)):
    # 1. Retrieve the OAuth record by state
    oauth_record = db.query(OAuthState).filter(OAuthState.state == state).first()
    
    if not oauth_record:
        logger.debug(f"DEBUG: OAuth callback failed - state not found: {state[:10]}")
        raise HTTPException(
            status_code=400, 
            detail="OAuth session expired or invalid state. Please try connecting again."
        )

    user_id = oauth_record.user_id
    verifier = oauth_record.code_verifier
    saved_scopes = oauth_record.scopes.split(" ") if oauth_record.scopes else GMAIL_SCOPES
    
    logger.debug(f"DEBUG: Retrieved verifier for state {state[:10]} (user={user_id})")

    # 2. Reconstruct the flow with the EXACT same scopes to avoid "Scope has changed" error
    flow = build_flow(scopes=saved_scopes, state=state)
    
    # Critical: Set the verifier back on the flow instance for fetch_token to work
    flow.code_verifier = verifier

    try:
        flow.fetch_token(code=code)
    except Exception as e:
        logger.error(f"OAuth Token Fetch Error: {e}")
        # Clean up even on failure
        db.delete(oauth_record)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Failed to retrieve Google token: {str(e)}")

    # Capture before deletion
    frontend_url = oauth_record.frontend_origin or os.getenv("FRONTEND_URL", "http://127.0.0.1:5173")

    if oauth_record:
        db.delete(oauth_record)
        db.commit()

    creds = flow.credentials

    upsert_google_tokens(
        db=db,
        user_id=user_id,
        access_token=creds.token,
        refresh_token=creds.refresh_token,
        expiry=getattr(creds, "expiry", None),
        scope=" ".join(creds.scopes or []),
        token_type=getattr(creds, "token_type", None),
    )

    html_content = f"""
    <html>
    <body>
        <script>
            if (window.opener && !window.opener.closed) {{
                window.opener.postMessage('google_oauth_success', '{frontend_url}');
                window.close();
            }} else {{
                window.location.href = '{frontend_url}/?google=connected';
            }}
        </script>
        <p>Authentication successful! You can close this window.</p>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


@app.post("/ai/process")
def process(req: ProcessRequest, db: Session = Depends(get_db), token_user: Optional[User] = Depends(get_optional_user)):
    # Allow image-only messages — if files are attached but no text, use a default prompt
    has_files = bool(req.files)
    effective_input = req.input.strip()
    if not effective_input and not has_files:
        raise HTTPException(status_code=400, detail="Input missing")
    if not effective_input and has_files:
        # User sent image(s) without text — default to analysis
        effective_input = "Please analyze and describe the attached file(s)."

    # If a valid bearer token is provided, trust it over any client-supplied user_id
    effective_user_id = token_user.id if token_user else req.user_id
    
    # 1. JIT User Check & Name Fallback
    final_user_name = req.user_name or "Twin User"
    try:
        db_user = db.query(User).filter(User.id == effective_user_id).first()
        if not db_user:
            # Use specific email from token if available, otherwise fallback to UID
            final_email = token_user.email if token_user and token_user.email else effective_user_id
            db_user = User(id=effective_user_id, name=final_user_name, email=final_email)
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
            logger.info(f"👤 Created user: {effective_user_id}")
        final_user_name = db_user.name
        # Nuclear JIT name fix: handle case-insensitivity and common defaults
        is_generic = str(final_user_name).lower() in ["user", "twin user", "there", "none", "", "null"]
        if is_generic and db_user.email and "@" in db_user.email:
            # Extract name and strip digits for a cleaner look
            prefix = db_user.email.split("@")[0].replace(".", " ")
            prefix = "".join([i for i in prefix if not i.isdigit()]).strip()
            if prefix:
                final_user_name = prefix.title()
                # Optionally sync back to DB so it persists
                db_user.name = final_user_name
                db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"⚠️ DB User Fetch Error: {e}")
        # Continue with req.user_name as fallback

    # 2. Graph Invoke
    initial_state = {
        "user_id": effective_user_id,
        "user_name": final_user_name,
        "input": effective_input,
        "chat_history": req.chat_history,
        "intent": "other",
        "output": "",
        "task_plan": [],
        "approval_required": False,
        "response_type": "text",
        "image_url": None,
        "gmail_sync": req.gmail_sync,
        "calendar_sync": req.calendar_sync,
        "slack_sync": req.slack_sync,
        "files": req.files or []
    }

    # Augment prompt with text file contents (PDFs decoded as text, etc.)
    if req.files:
        text_file_context = []
        for f in req.files:
            mime = f.get("type", "")
            if not mime.startswith("image/"):
                try:
                    raw = f.get("data", "")
                    encoded = raw.split(",", 1)[1] if "," in raw else raw
                    content = base64.b64decode(encoded).decode("utf-8", errors="replace")
                    text_file_context.append(f'--- File: {f["name"]} ---\n{content[:3000]}\n---')
                except Exception as fe:
                    logger.warning(f"Could not decode text file {f.get('name')}: {fe}")
        if text_file_context:
            initial_state["input"] = effective_input + "\n\n" + "\n".join(text_file_context)
        else:
            initial_state["input"] = effective_input
    else:
        initial_state["input"] = effective_input
    
    # 🟢 Multimodal: Save uploaded files to Disk & DB
    if req.files:
        from db.models import FileAsset
        
        for f in req.files:
            try:
                # Expecting f['data'] to be data:image/png;base64,....
                header, encoded = f['data'].split(",", 1) if "," in f['data'] else (None, f['data'])
                file_bytes = base64.b64decode(encoded)
                
                filename = f"{uuid.uuid4()}_{f['name']}"
                save_path = os.path.join("uploads", filename)
                full_path = os.path.join(BACKEND_DIR, save_path)
                
                with open(full_path, "wb") as buffer:
                    buffer.write(file_bytes)
                
                new_asset = FileAsset(
                    user_id=effective_user_id,
                    name=f['name'],
                    file_type=f['type'],
                    size=len(file_bytes),
                    storage_path=save_path,
                    is_processed=True
                )
                db.add(new_asset)
            except Exception as e:
                logger.error(f"Failed to save file asset {f.get('name')}: {e}")
        db.commit()

    try:
        final_state = twin_graph.invoke(initial_state)

        # 2.3 Structured learning (best-effort; never block response)
        try:
            learn_from_interaction(
                db=db,
                user_id=effective_user_id,
                user_input=req.input,
                assistant_output=str(final_state.get("output", "")),
                intent=str(final_state.get("intent", "other")),
                chat_history=req.chat_history or [],
            )
        except Exception as e:
            logger.warning(f"Learning skipped: {e}")

        # 2.5 Store per-user memory (best-effort; never block response)
        try:
            store_memory(
                user_id=effective_user_id,
                doc_id=f"{uuid.uuid4().hex}_user",
                content=req.input,
                type="chat",
                metadata={"role": "user"}
            )
            if final_state.get("output"):
                store_memory(
                    user_id=effective_user_id,
                    doc_id=f"{uuid.uuid4().hex}_assistant",
                    content=str(final_state.get("output")),
                    type="chat",
                    metadata={"role": "assistant", "intent": final_state.get("intent", "other")}
                )
        except Exception as e:
            logger.warning(f"Memory store skipped: {e}")
        
        # 3. Log Activity
        try:
            new_log = TaskLog(
                user_id=effective_user_id,
                session_id=req.session_id,
                kind="prompt",
                input=req.input,
                intent=final_state.get("intent", "other"),
                output=final_state.get("output", ""),
                approved=False,
                response_type=final_state.get("response_type"),
                image_url=final_state.get("image_url"),
                metadata_json=json.dumps(
                    {
                        "approval_required": final_state.get("approval_required", False),
                        "task_plan": final_state.get("task_plan", []),
                    },
                    ensure_ascii=False,
                ),
            )
            db.add(new_log)
            db.commit()
        except Exception as log_err:
            logger.warning(f"Task log write failed: {log_err}")
            db.rollback()

        return {
            "output": final_state.get("output"),
            "intent": final_state.get("intent"),
            "approval_required": final_state.get("approval_required", False),
            "response_type": final_state.get("response_type", "text"),
            "image_url": final_state.get("image_url")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Graph Error: {e}")
        return {"output": f"❌ **Intelligence Error:** {str(e)}", "error": str(e)}

class GenerateTitleRequest(BaseModel):
    history: List[dict]

@app.post("/ai/generate-title")
def generate_chat_title(req: GenerateTitleRequest, current_user: User = Depends(get_current_user)):
    from graph.llm_utils import _llm
    
    # Format history for the LLM
    context = ""
    # We take the first 3-4 messages to get the 'first 2-3 prompts' context
    for msg in req.history[:4]: 
        role = "User" if msg.get("role") == "user" else "AI"
        text = msg.get("text", "")
        # Limit text length per message for title generation
        context += f"{role}: {text[:200]}...\n"
    
    system_prompt = "You are a professional assistant. Generate a concise, smart, and professional title (3-5 words) for this chat conversation based on the provided context. Return ONLY the title text, no quotes or punctuation."
    user_prompt = f"Context:\n{context}\n\nTitle:"
    
    try:
        title = _llm(system=system_prompt, user=user_prompt, force_fast=True)
        # Clean up title
        title = title.strip().strip('"').strip("'").split('\n')[0]
        if len(title) > 50: title = title[:47] + "..."
        return {"title": title}
    except Exception as e:
        logger.error(f"Title generation failed: {e}")
        return {"title": "New Discussion"}

@app.get("/ai/files")
def list_files(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from db.models import FileAsset
    files = db.query(FileAsset).filter(FileAsset.user_id == current_user.id).order_by(FileAsset.created_at.desc()).all()
    return [
        {
            "id": str(f.id),
            "name": f.name,
            "type": f.file_type,
            "size": f.size,
            "created_at": f.created_at.isoformat(),
            "storage_path": f.storage_path
        }
        for f in files
    ]

@app.get("/ai/files/{file_id}/download")
def download_file(file_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from db.models import FileAsset
    from fastapi.responses import FileResponse
    import os

    asset = db.query(FileAsset).filter(
        FileAsset.id == file_id,
        FileAsset.user_id == current_user.id
    ).first()

    if not asset:
        raise HTTPException(status_code=404, detail="File not found")

    full_path = os.path.join(BACKEND_DIR, asset.storage_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not on disk")

    return FileResponse(
        path=full_path,
        filename=asset.name,
        media_type=asset.file_type or "application/octet-stream"
    )

@app.delete("/ai/files/{file_id}")
def delete_file(file_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from db.models import FileAsset
    import os

    asset = db.query(FileAsset).filter(
        FileAsset.id == file_id,
        FileAsset.user_id == current_user.id
    ).first()

    if not asset:
        raise HTTPException(status_code=404, detail="File not found")

    full_path = os.path.join(BACKEND_DIR, asset.storage_path)
    
    try:
        # 1. Delete from disk
        if os.path.exists(full_path):
            os.remove(full_path)
            logger.info(f"🗑️ Deleted file from disk: {full_path}")
        
        # 2. Delete from DB
        db.delete(asset)
        db.commit()
        return {"status": "success", "message": "File deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete file {file_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete file")

@app.get("/history")
def get_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        logs = (
            db.query(TaskLog)
            .filter(TaskLog.user_id == current_user.id)
            .order_by(TaskLog.created_at.desc())
            .limit(15)
            .all()
        )
        return {
            "history": [
                {
                    "id": str(log.id),
                    "input": log.input,
                    "intent": log.intent,
                    "output": log.output,
                    "approved": log.approved,
                    "kind": getattr(log, "kind", "prompt"),
                    "session_id": getattr(log, "session_id", None),
                    "response_type": getattr(log, "response_type", None),
                    "image_url": getattr(log, "image_url", None),
                    "metadata": log.metadata_json,
                    "timestamp": log.created_at.isoformat()
                } for log in logs
            ]
        }
    except Exception as e:
        logger.exception(f"History Error: {e}")
        return {"history": []}

@app.get("/calendar/events")
def list_calendar(max_results: int = 20, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        events = get_upcoming_events(db=db, user_id=current_user.id, max_results=max_results)
        return {"events": events if events else [], "count": len(events) if events else 0}
    except RuntimeError as e:
        _tool_error(str(e), "GOOGLE_AUTH", status_code=401)
    except HttpError as e:
        sc, payload = _map_google_http_error(e)
        raise HTTPException(status_code=sc, detail=payload)
    except Exception as e:
        err_msg = str(e)
        if "unable to find the server" in err_msg.lower() or "temporary failure in name resolution" in err_msg.lower():
            logger.warning(f"🌐 Calendar Connectivity issue: {err_msg}")
        else:
            logger.exception(e)
        return {"events": [], "count": 0}

@app.get("/gmail/inbox")
def inbox(max_results: int = 5, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        emails = read_recent_emails(db=db, user_id=current_user.id, max_results=max_results)
        return {"emails": emails}
    except RuntimeError as e:
        _tool_error(str(e), "GOOGLE_AUTH", status_code=401)
    except HttpError as e:
        sc, payload = _map_google_http_error(e)
        raise HTTPException(status_code=sc, detail=payload)
    except Exception as e:
        err_msg = str(e)
        if "unable to find the server" in err_msg.lower() or "temporary failure in name resolution" in err_msg.lower():
            logger.warning(f"🌐 Gmail Connectivity issue: {err_msg}")
        else:
            logger.exception(e)
        return {"emails": []}

@app.post("/calendar/create")
def create_calendar(req: CreateEventRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        attendees = req.attendees
        if isinstance(attendees, str):
            attendees = [e.strip() for e in attendees.split(",") if e.strip()]
        if not req.title.strip():
            _tool_error("Please provide a meeting title.", "BAD_REQUEST")
        
        res = create_event(
            title=req.title,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            attendees=attendees,
            description=req.description,
            location=req.location,
            db=db,
            user_id=current_user.id,
            
        )
        
        # 🟢 Log Execution
        try:
            log = TaskLog(
                user_id=current_user.id,
                kind="execution",
                input=f"Created meeting: {req.title}",
                intent="calendar",
                output=f"Event created successfully at {req.start_datetime}",
                approved=True
            )
            db.add(log)
            db.commit()
        except Exception:
            db.rollback()

        return {"status": "success", "details": res}
    except ValueError as e:
        _tool_error(str(e), "BAD_DATETIME")
    except RuntimeError as e:
        _tool_error(str(e), "GOOGLE_AUTH", status_code=401)
    except HttpError as e:
        sc, payload = _map_google_http_error(e)
        raise HTTPException(status_code=sc, detail=payload)
    except Exception as e:
        logger.exception(e)
        _tool_error("Calendar execution failed. Please try again.", "CALENDAR_FAILED", status_code=500)

@app.post("/telegram/send")
def api_send_telegram(req: TelegramSendRequest, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.id == req.user_id).first()
        if not user or not user.telegram_chat_id:
            raise HTTPException(status_code=400, detail="Telegram not connected or unavailable.")
        
        # 🟢 Safety: Strip placeholders hallucinated by AI
        img_url = req.image_url
        if img_url:
            hallucinated_patterns = ["example.com", "[", "logo.png", "image.jpg", ".webp", ".jpeg"]
            # If it's a generic looking name without a full http path, it's likely a hallucination
            if not img_url.startswith("http") and not img_url.startswith("data:"):
                img_url = None
            elif any(p in img_url.lower() for p in hallucinated_patterns) and "http" in img_url.lower() and "example.com" in img_url.lower():
                img_url = None
            
        success = False
        if img_url:
            success = send_telegram_photo(str(user.telegram_chat_id), img_url, caption=req.message)
            # 🟢 Robust Fallback: If photo failed (e.g. broken URL), try sending as text
            if not success:
                logger.warning(f"Telegram photo push failed for {img_url}. Falling back to text message.")
                success = send_telegram_message(str(user.telegram_chat_id), f"📸 (Image failed to load)\n\n{req.message}")
        else:
            success = send_telegram_message(str(user.telegram_chat_id), req.message)
            
        if success:
            try:
                log = TaskLog(
                    user_id=user.id,
                    kind="execution",
                    input=f"Pushed notification to Telegram{' with image' if req.image_url else ''}",
                    intent="telegram",
                    output=req.message if not req.image_url else f"Image: {req.image_url}\nCaption: {req.message}",
                    approved=True
                )
                db.add(log)
                db.commit()
            except Exception:
                db.rollback()
            return {"status": "success", "message": "Telegram message pushed"}
        raise HTTPException(status_code=500, detail="Failed to send Telegram message")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/gmail/send")
def send_mail(req: EmailSendRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        if not req.subject.strip():
            _tool_error("Please provide an email subject.", "BAD_REQUEST")
        if not req.body.strip():
            _tool_error("Please provide an email body.", "BAD_REQUEST")
        res = send_email(db=db, user_id=current_user.id, to=req.to, subject=req.subject, body=req.body)
        
        # 🟢 Log Execution
        try:
            log = TaskLog(
                user_id=current_user.id,
                kind="execution",
                input=f"Sent email to: {req.to}",
                intent="email",
                output=f"Subject: {req.subject}",
                approved=True
            )
            db.add(log)
            db.commit()
        except Exception:
            db.rollback()

        return {"details": res}
    except RuntimeError as e:
        _tool_error(str(e), "GOOGLE_AUTH", status_code=401)
    except HttpError as e:
        sc, payload = _map_google_http_error(e)
        raise HTTPException(status_code=sc, detail=payload)
    except Exception as e:
        logger.exception(e)
        _tool_error("Email sending failed. Please try again.", "EMAIL_FAILED", status_code=500)

@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        id=uuid.uuid4().hex,
        email=req.email,
        name=req.name,
        hashed_password=hash_password(req.password),
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")

    # Auto-register in agent registry
    try:
        register_agent(db, user)
    except Exception as e:
        logger.warning(f"Agent registry registration failed for {user.id}: {e}")

    return {"user_id": str(user.id), "email": user.email, "name": user.name}

@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "access_token": create_access_token({"sub": str(user.id)}),
        "user_id": str(user.id),
        "email": user.email,
        "name": user.name,
    }

@app.post("/auth/firebase")
def firebase_auth(request: Request, req: FirebaseAuthRequest, db: Session = Depends(get_db)):
    """
    Exchange Firebase UID for a backend JWT.
    The client has already authenticated with Firebase; we trust the UID.
    
    TODO: Enable server-side verification by uncommenting the block below
    once firebase-admin SDK service account JSON is configured in the environment.
    
    import firebase_admin.auth as fb_auth
    id_token = request.headers.get("X-Firebase-Token")
    if id_token:
        try:
            decoded = fb_auth.verify_id_token(id_token)
            if decoded["uid"] != req.uid:
                raise HTTPException(status_code=403, detail="Token UID mismatch")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {e}")
    """
    if not req.uid:
        raise HTTPException(status_code=400, detail="uid is required")
    
    # Log the presence of the Firebase token for audit trail
    fb_token_present = bool(request.headers.get("X-Firebase-Token"))
    logger.debug(f"[Auth] Firebase auth for uid={req.uid}, token_header={'yes' if fb_token_present else 'no'}")

    user = db.query(User).filter(User.id == req.uid).first()
    if not user:
        # Create a backend identity row keyed by Firebase UID
        user = User(
            id=req.uid,
            email=req.email or req.uid,
            name=req.name or "User",
            hashed_password=None,
        )
        try:
            db.add(user)
            db.commit()
            db.refresh(user)
        except IntegrityError as ie:
            db.rollback()
            logger.warning(f"[Auth] IntegrityError on user creation for {req.uid}: {ie}")
            # If email collided, fall back to UID-based pseudo-email to allow login
            user_by_id = db.query(User).filter(User.id == req.uid).first()
            if user_by_id:
                user = user_by_id
                logger.info(f"[Auth] User {req.uid} already exists despite lookup failure, proceeding.")
            else:
                user = User(
                    id=req.uid,
                    email=f"{req.uid}@firebase.twin", # Fallback email to avoid collision
                    name=req.name or "User",
                    hashed_password=None,
                )
                try:
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                    logger.info(f"[Auth] Created user {req.uid} with fallback email.")
                except Exception as e2:
                    db.rollback()
                    logger.error(f"[Auth] Critical failure creating user {req.uid}: {e2}")
                    raise HTTPException(status_code=409, detail="User creation conflict. This email may be registered to another account.")
    else:
        # Keep basic profile up to date (best-effort)
        updates = {}
        if req.email and user.email != req.email:
            updates["email"] = req.email
        if req.name and user.name != req.name:
            updates["name"] = req.name
        if updates:
            for k, v in updates.items():
                setattr(user, k, v)
            try:
                db.add(user)
                db.commit()
                db.refresh(user)
            except IntegrityError:
                db.rollback()

    # Auto-register in agent registry (idempotent upsert)
    try:
        register_agent(db, user)
    except Exception as e:
        logger.warning(f"Agent registry registration failed for {user.id}: {e}")

    return {
        "access_token": create_access_token({"sub": str(user.id)}),
        "user_id": str(user.id),
        "email": user.email,
        "name": user.name,
    }


@app.get("/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return {"user_id": str(current_user.id), "email": current_user.email, "name": current_user.name}
@app.post("/settings/telegram")
def update_telegram(req: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat_id = req.get("chat_id")
    if chat_id is not None:
        chat_id = str(chat_id).strip()
    else:
        chat_id = ""
    if chat_id:
        existing_user = db.query(User).filter(User.telegram_chat_id == chat_id, User.id != current_user.id).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="This Telegram Chat ID is already linked to another AI Twin account.")
    
    enabled = bool(req.get("enabled", False))
    current_user.telegram_chat_id = chat_id
    current_user.telegram_enabled = enabled
    db.commit()
    return {"status": "success", "chat_id": chat_id, "enabled": enabled}

@app.get("/oauth/slack/start")
def slack_oauth_start(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not SLACK_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Slack client ID not configured")
    
    state = _encode_oauth_state(current_user.id)
    # Save state to DB
    db.add(OAuthState(state=state, user_id=current_user.id, code_verifier="none")) # code_verifier not used for Slack standard OAuth but model requires it
    db.commit()
    
    scopes = "channels:history,channels:read,chat:write,groups:read,im:read,mpim:read"
    auth_url = f"https://slack.com/oauth/v2/authorize?client_id={SLACK_CLIENT_ID}&scope={scopes}&user_scope=&redirect_uri={SLACK_REDIRECT_URI}&state={state}"
    return {"auth_url": auth_url}

@app.get("/oauth/slack/callback")
def slack_oauth_callback(code: str, state: str, db: Session = Depends(get_db)):
    oauth_record = db.query(OAuthState).filter(OAuthState.state == state).first()
    if not oauth_record:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    
    user_id = oauth_record.user_id
    db.delete(oauth_record)
    db.commit()
    
    # Exchange code for token
    url = "https://slack.com/api/oauth.v2.access"
    data = {
        "client_id": SLACK_CLIENT_ID,
        "client_secret": SLACK_CLIENT_SECRET,
        "code": code,
        "redirect_uri": SLACK_REDIRECT_URI
    }
    res = requests.post(url, data=data).json()
    if not res.get("ok"):
        logger.error(f"Slack OAuth Error: {res.get('error')}")
        raise HTTPException(status_code=400, detail=f"Slack OAuth failed: {res.get('error')}")
    
    access_token = res["access_token"]
    upsert_slack_tokens(db, user_id, access_token, scope=res.get("scope"), bot_user_id=res.get("bot_user_id"))
    
    frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173")
    return RedirectResponse(url=f"{frontend_url}/workspace?slack=connected")

@app.get("/integrations/slack/status")
def slack_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"connected": is_slack_connected(db, current_user.id)}

@app.post("/integrations/slack/disconnect")
def slack_disconnect(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(IntegrationToken).filter(IntegrationToken.user_id == current_user.id, IntegrationToken.provider == "slack").delete()
    db.commit()
    return {"status": "success"}

@app.get("/slack/channels")
def list_channels(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        channels = list_slack_channels(db, current_user.id)
        return {"channels": channels}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/slack/send")
def send_msg(req: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    channel_id = req.get("channel_id")
    text = req.get("text")
    if not channel_id or not text:
        raise HTTPException(status_code=400, detail="Missing channel_id or text")
    try:
        res = send_slack_message(db, current_user.id, channel_id, text)
        return {"status": "success", "details": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/slack/events")
async def slack_events(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    
    # 1. URL Verification (Challenge)
    if data.get("type") == "url_verification":
        return {"challenge": data.get("challenge")}
    
    # 2. Event Processing
    if data.get("type") == "event_callback":
        event = data.get("event", {})
        event_type = event.get("type")
        
        # Avoid processing bot's own messages
        if event.get("bot_id") or event.get("subtype") == "bot_message":
            return {"status": "ignored"}
            
        if event_type in ("message", "app_mention"):
            channel_id = event.get("channel")
            text = event.get("text", "")
            slack_user = event.get("user")
            
            # Find which user this bot belongs to
            bot_user_id = data.get("authorizations", [{}])[0].get("user_id")
            internal_user_id = None
            if bot_user_id:
                from tools.slack_tool import get_user_id_by_slack_bot_id
                internal_user_id = get_user_id_by_slack_bot_id(db, bot_user_id)
            
            if not internal_user_id:
                logger.warning(f"Slack event received for unknown bot_user_id: {bot_user_id}")
                return {"status": "unknown_bot"}
            
            user = db.query(User).filter(User.id == internal_user_id).first()
            if not user:
                return {"status": "user_not_found"}

            # Process via AI Graph
            initial_state = {
                "user_id": user.id,
                "user_name": user.name,
                "input": text,
                "chat_history": [],
                "intent": "other",
                "output": "",
                "task_plan": [],
                "approval_required": False,
                "slack_sync": True
            }
            
            # Run graph in background or sync? 
            # For Slack, we should probably respond quickly, but let's try sync first for simplicity
            res = twin_graph.invoke(initial_state)
            clean_res = extract_reply(res["output"])
            
            # Send reply back to Slack
            send_slack_message(db, user.id, channel_id, clean_res)
            
            return {"status": "processed"}

    return {"status": "ok"}

@app.post("/gmail/webhook")
@app.post("/telegram/webhook")
async def webhooks_receiver(request: Request):
    """Explicitly catch webhooks to prevent them from being proxied to the frontend (404)"""
    logger.info(f"Webhook received at {request.url.path}")
    return {"status": "received"}

@app.get("/settings/telegram")
def get_telegram(current_user: User = Depends(get_current_user)):
    return {
        "chat_id": current_user.telegram_chat_id,
        "enabled": current_user.telegram_enabled
    }

@app.put("/settings/preferences")
def update_preferences(req: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import json
    current_user.preferences_json = json.dumps(req, ensure_ascii=False)
    db.commit()
    return {"status": "success"}

@app.get("/settings/preferences")
def get_preferences(current_user: User = Depends(get_current_user)):
    try:
        return json.loads(current_user.preferences_json or "{}")
    except Exception:
        return {}

@app.get("/test-telegram")
def test_telegram(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.telegram_chat_id:
        return {"status": "error", "message": "No Telegram chat ID set"}
    
    briefing = generate_daily_briefing(db, current_user.id, current_user.name)
    success = send_telegram_message(current_user.telegram_chat_id, f"🧪 *Manual Test Briefing*\n\n{briefing}")
    return {"status": "success" if success else "error", "message": "Briefing sent" if success else "Failed to send"}

@app.delete("/memory/reset")
def reset_memory(user_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized memory reset request")
        
    try:
        # Delete task logs
        db.query(TaskLog).filter(TaskLog.user_id == current_user.id).delete()
        # Delete structured memories
        db.query(StructuredMemory).filter(StructuredMemory.user_id == current_user.id).delete()
        db.commit()
        return {"status": "success", "message": "Memory cleared completely."}
    except Exception as e:
        db.rollback()
        logger.exception(f"Memory reset error: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset memory")

@app.get("/analytics")
def get_analytics(
    gmail_sync: bool = True,
    calendar_sync: bool = True,
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Fetches real-time productivity metrics for the dashboard."""
    now = datetime.utcnow()
    one_week_ago = now - timedelta(days=7)
    
    # 1. Emails Monitored (Last 7 days)
    email_count = 0
    if gmail_sync:
        email_count = db.query(ProcessedEmail).filter(
            ProcessedEmail.user_id == current_user.id,
            ProcessedEmail.processed_at >= one_week_ago
        ).count()
    
    # 2. Tasks Executed (Total)
    task_count = db.query(TaskLog).filter(TaskLog.user_id == current_user.id).count()
    
    # 3. Meetings (Current Week)
    meetings = []
    if calendar_sync:
        try:
            meetings = get_upcoming_events(db, current_user.id, max_results=50)
        except Exception as e:
            logger.error(f"Analytics Meeting Fetch Error: {e}")
    
    # 4. Weekly Distribution (Heatmap Data)
    days_map = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    today_idx = now.weekday()
    days = [days_map[(today_idx + i) % 7] for i in range(7)]
    recent_tasks = db.query(TaskLog).filter(
        TaskLog.user_id == current_user.id,
        TaskLog.created_at >= one_week_ago
    ).all()
    
    recent_emails = db.query(ProcessedEmail).filter(
        ProcessedEmail.user_id == current_user.id,
        ProcessedEmail.processed_at >= one_week_ago
    ).all()
    
    distribution = {day: 0 for day in days}
    
    for t in recent_tasks:
        day_name = t.created_at.strftime('%a')
        if day_name in distribution:
            distribution[day_name] += 1
        
    for e in recent_emails:
        day_name = e.processed_at.strftime('%a')
        if day_name in distribution:
            distribution[day_name] += 1
    
    for m in meetings:
        try:
            m_date = datetime.fromisoformat(m["start"].replace("Z", "+00:00"))
            m_day = m_date.strftime('%a')
            if m_day in distribution:
                distribution[m_day] += 1
        except Exception:
            continue

    max_val = max(distribution.values()) if distribution.values() else 1
    if max_val == 0:
        max_val = 1
    
    heatmap = []
    for d in days:
        val = distribution[d]
        intensity = min(4, int((val / max_val) * 4)) if val > 0 else 0
        heatmap.append({
            "day": d,
            "tasks": val,
            "intensity": intensity
        })

    # Determine dynamic priority based on stats
    priority = "Roadmap Alignment"
    if len(meetings) > 3:
        priority = "Schedule Management"
    elif email_count > 100:
        priority = "Inbox Zero Cleanup"
    elif task_count > 10:
        priority = "Execution Protocol"
        
    return {
        "emails_total": email_count,
        "meetings_total": len(meetings),
        "tasks_total": task_count,
        "efficiency": f"{min(99.9, round(100 * task_count / max(1, task_count + 1), 1))}%",
        "heatmap": heatmap,
        "priority": priority
    }

@app.get("/intelligence/insights")
async def get_insights(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        memories = db.query(StructuredMemory).filter(
            StructuredMemory.user_id == current_user.id,
            StructuredMemory.category == "reference"
        ).order_by(StructuredMemory.updated_at.desc()).limit(12).all()
        
        return [{
            "key": m.key, 
            "value": m.value, 
            "source": m.source, 
            "updated_at": m.updated_at.isoformat() if m.updated_at else None
        } for m in memories]
    except Exception as e:
        logger.error(f"Failed to fetch insights: {e}")
        return []

# ─────────────────────────────────────────────────────────────────────────────
# Smart Proxy: Route everything else to the Frontend Dev Server (port 5173)
# ─────────────────────────────────────────────────────────────────────────────
@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def catch_all_proxy(request: Request, path: str):
    """
    Forward any unmatched request to the Vite dev server.
    Ensures that / and all frontend routes work through port 8000.
    """
    target_url = f"http://127.0.0.1:5173/{path}"
    if request.query_params:
        target_url += f"?{request.query_params}"

    async with httpx.AsyncClient() as client:
        # Map headers and force Host to localhost:5173 so Vite security allows it
        headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
        headers["host"] = "127.0.0.1:5173"
        try:
            body = await request.body()
            proxy_res = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=body,
                follow_redirects=True,
                timeout=10.0
            )
            return StreamingResponse(
                proxy_res.aiter_bytes(),
                status_code=proxy_res.status_code,
                headers=dict(proxy_res.headers)
            )
        except Exception as e:
            return {
                "error": "Frontend unreachable",
                "message": "Make sure 'npm run dev' is running on port 5173",
                "details": str(e)
            }
