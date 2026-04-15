from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import os

load_dotenv()

from tools.gmail_tool import read_recent_emails, draft_email, send_email
from tools.calendar_tool import get_upcoming_events, create_event
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from db.database import get_db, engine
from db.models import Base, User, TaskLog
from db.auth import hash_password, verify_password, create_access_token, decode_token
import uuid
from typing import Optional, List, Union

Base.metadata.create_all(bind=engine)

security = HTTPBearer()

from graph.graph import twin_graph
from memory.chroma import store_memory

app = FastAPI(title="AI Twin API")

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