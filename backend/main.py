import os
import re
import uuid
import asyncio
import secrets
import logging
import traceback
from typing import Optional, List, Union
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv()
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, validator
import json
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi.responses import RedirectResponse
from googleapiclient.errors import HttpError

from db.database import get_db, engine
from db.models import Base, User, TaskLog, ProcessedEmail, OAuthState, IntegrationToken
from db.auth import hash_password, verify_password, create_access_token, decode_token
from tools.gmail_tool import read_recent_emails, draft_email, send_email, reply_to_email, get_email_details
from tools.calendar_tool import get_upcoming_events, create_event, normalize_datetime
from tools.google_oauth import (
    build_flow,
    upsert_google_tokens,
    is_connected,
    GMAIL_SCOPES,
    CALENDAR_SCOPES,
)
from graph.graph import twin_graph
from memory.chroma import store_memory
from memory.learning import learn_from_interaction, get_structured_memories_text

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

security = HTTPBearer(auto_error=False)

app = FastAPI(title="AI Twin API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_reply(text: str) -> str:
    """Extracts only the content within <reply> tags, or returns original text if tags not found."""
    match = re.search(r'<reply>(.*?)</reply>', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()

# Setup Background Task
AUTO_SEND = os.getenv("AUTO_SEND", "false").lower() == "true"

async def process_new_emails():
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
                    emails = read_recent_emails(db=db, user_id=uid, max_results=5)
                    for mail in emails:
                        existing = db.query(ProcessedEmail).filter(ProcessedEmail.id == mail["id"]).first()
                        if existing:
                            continue

                        initial_state = {
                            "user_id": uid,
                            "input": f"Read email {mail['id']} and suggest a suitable reply.",
                            "intent": "",
                            "task_plan": [],
                            "output": "",
                            "approval_required": False
                        }
                        res = twin_graph.invoke(initial_state)
                        clean_body = extract_reply(res["output"])

                        if AUTO_SEND:
                            reply_to_email(db=db, user_id=uid, message_id=mail["id"], body=clean_body)
                            action = "sent"
                        else:
                            info = get_email_details(db=db, user_id=uid, message_id=mail["id"])
                            draft_email(db=db, user_id=uid, to=info["from"], subject=f"Re: {info['subject']}", body=clean_body)
                            action = "drafted"

                        entry = ProcessedEmail(id=mail["id"], thread_id=mail.get("threadId", ""), action_taken=action)
                        db.add(entry)
                        db.commit()
                        processed_count += 1
                except Exception as user_err:
                    logger.error(f"Email Monitor Error for user {uid}: {user_err}")
                    continue
    except Exception as e:
        logger.error(f"Email Monitor Error: {e}")
    return processed_count > 0

async def monitor_emails():
    while True:
        await process_new_emails()
        await asyncio.sleep(600)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(monitor_emails())

# Pydantic Schemas
class ProcessRequest(BaseModel):
    input: str
    user_id: str
    user_name: Optional[str] = None
    chat_history: List[dict] = Field(default_factory=list)
    session_id: Optional[str] = None

class MemoryRequest(BaseModel):
    user_id: str
    doc_id: str
    text: str

class EmailDraftRequest(BaseModel):
    to: str
    subject: str
    body: str

class EmailSendRequest(BaseModel):
    to: EmailStr
    subject: str
    body: str

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

@app.get("/")
def root():
    return {"message": "AI Twin API Active"}

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    payload = decode_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found for token")
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
    selected_scopes: list[str] = []
    if "gmail" in scope_set:
        selected_scopes += GMAIL_SCOPES
    if "calendar" in scope_set:
        selected_scopes += CALENDAR_SCOPES
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

    frontend_url = oauth_record.frontend_origin or os.getenv("FRONTEND_URL", "http://127.0.0.1:5173")
    return RedirectResponse(url=f"{frontend_url}/?google=connected")


@app.post("/ai/process")
def process(req: ProcessRequest, db: Session = Depends(get_db), token_user: Optional[User] = Depends(get_optional_user)):
    if not req.input.strip():
        raise HTTPException(status_code=400, detail="Input missing")

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
        "input": req.input,
        "chat_history": req.chat_history,
        "intent": "other",
        "output": "",
        "task_plan": [],
        "approval_required": False,
        "response_type": "text",
        "image_url": None
    }
    
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
        except:
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
        return {"error": str(e)}

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
            db.add(log); db.commit()
        except: db.rollback()

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
            db.add(log); db.commit()
        except: db.rollback()

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
def firebase_auth(req: FirebaseAuthRequest, db: Session = Depends(get_db)):
    # Note: this endpoint assumes the caller is already authenticated with Firebase.
    # In production, verify a Firebase ID token server-side and only then mint backend JWTs.
    if not req.uid:
        raise HTTPException(status_code=400, detail="uid is required")

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
        except IntegrityError:
            db.rollback()
            # If email collided, fall back to UID email and try once more
            user = db.query(User).filter(User.id == req.uid).first()
            if not user:
                raise HTTPException(status_code=409, detail="User creation failed")
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

    return {
        "access_token": create_access_token({"sub": str(user.id)}),
        "user_id": str(user.id),
        "email": user.email,
        "name": user.name,
    }

@app.get("/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return {"user_id": str(current_user.id), "email": current_user.email, "name": current_user.name}