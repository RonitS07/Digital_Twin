import os
import re
import uuid
import asyncio
from typing import Optional, List, Union

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db, engine
from db.models import Base, User, TaskLog, ProcessedEmail
from db.auth import hash_password, verify_password, create_access_token, decode_token
from tools.gmail_tool import read_recent_emails, draft_email, send_email, reply_to_email, get_email_details, watch_gmail
from tools.calendar_tool import get_upcoming_events, create_event
from graph.graph import twin_graph
from memory.chroma import store_memory

load_dotenv()

Base.metadata.create_all(bind=engine)

security = HTTPBearer()

from graph.graph import twin_graph
from memory.chroma import store_memory

app = FastAPI(title="AI Twin API")

def extract_reply(text: str) -> str:
    """Extracts only the content within <reply> tags, or returns original text if tags not found."""
    match = re.search(r'<reply>(.*?)</reply>', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()

# Setup Background Task
AUTO_SEND = os.getenv("AUTO_SEND", "false").lower() == "true"

async def process_new_emails():
    """Shared logic to check and process new emails. Returns True if any new email was processed."""
    processed_count = 0
    try:
        with next(get_db()) as db:
            emails = read_recent_emails(max_results=5)
            for mail in emails:
                # Check if already processed
                existing = db.query(ProcessedEmail).filter(ProcessedEmail.id == mail["id"]).first()
                if existing:
                    continue
                
                print(f"Instantly processing email: {mail['id']}")
                
                # 1. Ask AI to draft a reply
                initial_state = {
                    "user_id":           "default_user",
                    "input":             f"Read email {mail['id']} and suggest a suitable reply.",
                    "intent":            "",
                    "task_plan":         [],
                    "context":           "",
                    "output":            "",
                    "approval_required": False
                }
                result = twin_graph.invoke(initial_state)
                
                # 2. Execute Action
                clean_body = extract_reply(result["output"])
                if AUTO_SEND:
                    reply_to_email(message_id=mail["id"], body=clean_body)
                    action = "sent"
                else:
                    info = get_email_details(mail["id"])
                    draft_email(to=info["from"], subject=f"Re: {info['subject']}", body=clean_body)
                    action = "drafted"

                # 3. Mark as processed
                entry = ProcessedEmail(id=mail["id"], thread_id=mail.get("threadId", ""), action_taken=action)
                db.add(entry)
                db.commit()
                processed_count += 1
    except Exception as e:
        print(f"Email processing error: {e}")
    return processed_count > 0

async def monitor_emails():
    print(f"Starting Email Monitor (Auto-Send: {AUTO_SEND})")
    while True:
        await process_new_emails()
        await asyncio.sleep(600) # Fallback polling every 10 mins

@app.post("/gmail/webhook")
async def gmail_webhook(req: dict):
    """Endpoint where Google Pub/Sub sends notifications."""
    # Only print if a new email was actually handled
    new_found = await process_new_emails()
    if new_found:
        print("🔔 New email discovered and handled!")
    return {"status": "processed"}

@app.post("/gmail/watch")
def start_watch(topic_name: str):
    """Initialize the Gmail watch subscription."""
    from tools.gmail_tool import watch_gmail
    try:
        result = watch_gmail(topic_name)
        return {"status": "watch_started", "details": result}
    except Exception as e:
        return {"error": str(e)}

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(monitor_emails())

class ProcessRequest(BaseModel):
    input: str
    user_id: Optional[str] = "default_user"

class MemoryStoreRequest(BaseModel):
    user_id: Optional[str] = "default_user"
    doc_id: str
    text: str

class MemoryUpdateRequest(BaseModel):
    user_id: Optional[str] = "default_user"
    doc_id: str
    text: str

class EmailDraftRequest(BaseModel):
    to: str
    subject: str
    body: str

class EmailSendRequest(BaseModel):
    to: str
    subject: str
    body: str

class EmailReplyRequest(BaseModel):
    message_id: str
    body: str

class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class CreateEventRequest(BaseModel):
    title: str
    start_datetime: str
    end_datetime: str
    attendees: Optional[Union[str, List[str]]] = []
    description: Optional[str] = ""
    location: Optional[str] = ""

@app.get("/")
def root():
    return {"message": "AI Twin API running"}

@app.post("/ai/process")
def process(req: ProcessRequest, db: Session = Depends(get_db)):
    if not req.input.strip():
        return {"error": "Input missing"}

    initial_state = {
        "user_id":           req.user_id,
        "input":             req.input,
        "intent":            "",
        "task_plan":         [],
        "context":           "",
        "output":            "",
        "approval_required": False
    }

    try:
        result = twin_graph.invoke(initial_state)

        # ── Log to PostgreSQL ────────────────────────────────────
        try:
            log_user_id = None
            if req.user_id and req.user_id != "default_user":
                try:
                    log_user_id = uuid.UUID(req.user_id)
                except ValueError:
                    log_user_id = None

            log = TaskLog(
                user_id=log_user_id,
                input=result["input"],
                intent=result["intent"],
                output=result["output"],
                approved=not result["approval_required"]
            )
            db.add(log)
            db.commit()
            print("Task logged successfully")
        except Exception as log_err:
            print(f"Logging error: {log_err}")
            db.rollback()
        # ────────────────────────────────────────────────────────

        # ── Auto-Draft Logic ─────────────────────────────────────
        if result["intent"] == "email" and "draft" in result["output"].lower():
            # Extract email ID from context or input
            match = re.search(r'\b([a-f0-9]{16})\b', result["input"])
            email_id = match.group(1) if match else None
            
            # Create a draft with the AI output
            try:
                # Extract only the content between <reply> tags
                body = extract_reply(result["output"])
                
                # If we have an email_id, we use the reply tool
                if email_id:
                    # Fetch receiver for replying
                    info = get_email_details(email_id)
                    draft_res = draft_email(to=info["from"], subject=f"Re: {info['subject']}", body=body)
                else:
                    # New draft
                    draft_res = draft_email(to="recipient@example.com", subject="AI Generated Draft", body=body)
                
                result["task_plan"].append(f"Auto-Draft Created: {draft_res.get('draft_id')}")
            except Exception as e:
                print(f"Auto-drafting error: {e}")
        # ────────────────────────────────────────────────────────

        return {
            "input":             result["input"],
            "intent":            result["intent"],
            "task_plan":         result["task_plan"],
            "context_found":     bool(result["context"]),
            "output":            result["output"],
            "approval_required": result["approval_required"]
        }
    except Exception as e:
        return {"error": str(e)}
        
@app.post("/memory/store")
def store(req: MemoryStoreRequest):
    store_memory(user_id=req.user_id, doc_id=req.doc_id, text=req.text)
    return {"status": "stored", "doc_id": req.doc_id}

@app.get("/history")
def get_history(user_id: str = "default_user", db: Session = Depends(get_db)):
    try:
        logs = db.query(TaskLog).order_by(TaskLog.created_at.desc()).limit(20).all()
        return {
            "history": [
                {
                    "id":        str(log.id),
                    "input":     log.input,
                    "intent":    log.intent,
                    "output":    log.output,
                    "approved":  log.approved,
                    "timestamp": log.created_at.isoformat()
                }
                for log in logs
            ]
        }
    except Exception as e:
        return {"error": str(e)}

@app.delete("/memory/reset")
def reset_memory(user_id: str = "default_user"):
    from memory.chroma import client
    try:
        client.delete_collection(f"user_{user_id}")
        return {"status": "cleared", "user_id": user_id}
    except Exception as e:
        return {"error": str(e)}

@app.patch("/memory/update")
def update_memory(req: MemoryUpdateRequest):
    store_memory(user_id=req.user_id, doc_id=req.doc_id, text=req.text)
    return {"status": "updated", "doc_id": req.doc_id}

@app.get("/gmail/inbox")
def get_inbox(max_results: int = 5):
    try:
        emails = read_recent_emails(max_results=max_results)
        return {"emails": emails, "count": len(emails)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/gmail/draft")
def create_draft(req: EmailDraftRequest):
    try:
        result = draft_email(to=req.to, subject=req.subject, body=req.body)
        return {"status": "draft_created", "details": result}
    except Exception as e:
        return {"error": str(e)}

@app.post("/gmail/send")
def send_mail(req: EmailSendRequest):
    try:
        result = send_email(to=req.to, subject=req.subject, body=req.body)
        return {"status": "sent", "details": result}
    except Exception as e:
        return {"error": str(e)}

@app.post("/gmail/reply")
def reply_to_mail(req: EmailReplyRequest):
    try:
        result = reply_to_email(message_id=req.message_id, body=req.body)
        return {"status": "replied", "details": result}
    except Exception as e:
        return {"error": str(e)}

@app.get("/calendar/events")
def list_events(max_results: int = 10):
    try:
        events = get_upcoming_events(max_results=max_results)
        return {"events": events, "count": len(events)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/calendar/create")
def create_calendar_event(req: CreateEventRequest):
    try:
        # Normalize attendees to a list if it's a string
        attendees = req.attendees
        if isinstance(attendees, str):
            attendees = [email.strip() for email in attendees.split(",") if email.strip()]

        result = create_event(
            title=req.title,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            attendees=attendees,
            description=req.description,
            location=req.location
        )
        return {"status": "event_created", "details": result}
    except Exception as e:
        return {"error": str(e)}

@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=req.email,
        name=req.name,
        hashed_password=hash_password(req.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"status": "registered", "user_id": str(user.id), "email": user.email}

@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return {"access_token": token, "token_type": "bearer", "user_id": str(user.id)}

@app.get("/auth/me")
def get_me(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": str(user.id), "email": user.email, "name": user.name}