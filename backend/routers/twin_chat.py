"""
Twin-to-Twin Direct Chat Router
=================================
REST + WebSocket routes for the Direct Chat system.

Endpoints:
  POST   /twin-chat/sessions                  – Start or find a session
  GET    /twin-chat/sessions                  – List my sessions
  GET    /twin-chat/sessions/{id}             – Session detail + messages
  POST   /twin-chat/sessions/{id}/messages    – Send a human message
  POST   /twin-chat/sessions/{id}/suggest     – Ask Twin for reply suggestions
  POST   /twin-chat/sessions/{id}/enhance     – Polish a draft
  POST   /twin-chat/sessions/{id}/approve/{msg_id}   – Approve a Twin suggestion
  DELETE /twin-chat/sessions/{id}/messages/{msg_id}  – Reject/delete suggestion
  POST   /twin-chat/sessions/{id}/summarize   – Summarize conversation
  GET    /twin-chat/users/search              – Find users to chat with
  WS     /twin-chat/ws/{session_id}           – Real-time WebSocket
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import (
    APIRouter, Depends, HTTPException, status, Query,
    WebSocket, WebSocketDisconnect
)
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from db.database import get_db
from db.models import User
from db.twin_chat_models import DirectChatSession, DirectChatMessage
from security.auth import get_current_user
from services.twin_chat_service import (
    generate_twin_enrichment,
    generate_twin_suggestion_only,
    summarize_conversation,
    store_message_in_memory,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/twin-chat", tags=["twin-chat"])

# ────────────────────────────────────────────────────────────────────
# WebSocket Connection Manager
# ────────────────────────────────────────────────────────────────────

class ConnectionManager:
    """Manages active WebSocket connections per user and per session."""
    def __init__(self):
        # user_id -> set of active WebSockets
        self._user_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        if user_id not in self._user_connections:
            self._user_connections[user_id] = set()
        self._user_connections[user_id].add(ws)
        logger.info(f"[WS] User {user_id} connected globally")

    def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self._user_connections:
            self._user_connections[user_id].discard(ws)
            if not self._user_connections[user_id]:
                del self._user_connections[user_id]
        logger.info(f"[WS] User {user_id} disconnected")

    async def send_to_user(self, user_id: str, payload: dict):
        """Send payload to all connected WebSockets for a specific user."""
        if user_id not in self._user_connections:
            return
        dead = []
        for ws in self._user_connections[user_id]:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._user_connections[user_id].discard(ws)

    async def broadcast_to_session(self, session: DirectChatSession, payload: dict, exclude_user_id: Optional[str] = None):
        """Send payload to all participants of a session."""
        uids = [session.initiator_id, session.partner_id]
        for uid in uids:
            if uid == exclude_user_id:
                continue
            await self.send_to_user(uid, payload)

manager = ConnectionManager()

# ────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ────────────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    partner_id: str
    title: Optional[str] = None

class SendMessageRequest(BaseModel):
    content: str
    sender_type: str = "human"   # human | twin
    status: str = "sent"

class SuggestRequest(BaseModel):
    incoming_message: str
    conversation_history: Optional[List[dict]] = []

class EnhanceRequest(BaseModel):
    draft: str
    conversation_history: Optional[List[dict]] = []

class ApproveMessageRequest(BaseModel):
    content: Optional[str] = None  # override content if editing before sending


# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────

def _serialize_message(msg: DirectChatMessage, include_sender_name: bool = True) -> dict:
    suggestions = []
    if msg.suggestions_json:
        try:
            suggestions = json.loads(msg.suggestions_json)
        except Exception:
            pass
    metadata = {}
    if msg.metadata_json:
        try:
            metadata = json.loads(msg.metadata_json)
        except Exception:
            pass
    return {
        "id": msg.id,
        "session_id": msg.session_id,
        "sender_id": msg.sender_id,
        "sender_name": msg.sender.name if msg.sender else None,
        "sender_photo": msg.sender.name if msg.sender else None,
        "sender_type": msg.sender_type,
        "status": msg.status,
        "content": msg.content,
        "suggestions": suggestions,
        "memory_context": msg.memory_context,
        "metadata": metadata,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "updated_at": msg.updated_at.isoformat() if msg.updated_at else None,
    }


def _serialize_session(session: DirectChatSession, current_user_id: str) -> dict:
    partner = session.partner if session.initiator_id == current_user_id else session.initiator
    return {
        "id": session.id,
        "title": session.title,
        "status": session.status,
        "twin_mode": session.twin_mode,
        "initiator_id": session.initiator_id,
        "partner_id": session.partner_id,
        "partner": {
            "id": partner.id,
            "name": partner.name,
            "email": partner.email,
        } if partner else None,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "last_message_at": session.last_message_at.isoformat() if session.last_message_at else None,
        "unread_count": 0,  # can be implemented with read receipts later
    }


def _get_history_dicts(messages: list) -> list[dict]:
    return [
        {
            "sender_id": m.sender_id,
            "sender_type": m.sender_type,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


# ────────────────────────────────────────────────────────────────────
# Session Endpoints
# ────────────────────────────────────────────────────────────────────

@router.post("/sessions", status_code=201)
def start_or_get_session(
    body: StartSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a new twin-chat session with a partner, or return existing active one."""
    partner = db.query(User).filter(User.id == body.partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner user not found")
    if partner.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot start a chat with yourself")

    # Check for existing active session (either direction)
    existing = db.query(DirectChatSession).filter(
        DirectChatSession.status == "active",
        or_(
            and_(
                DirectChatSession.initiator_id == current_user.id,
                DirectChatSession.partner_id == partner.id,
            ),
            and_(
                DirectChatSession.initiator_id == partner.id,
                DirectChatSession.partner_id == current_user.id,
            ),
        )
    ).first()

    if existing:
        return {
            "session": _serialize_session(existing, current_user.id),
            "created": False,
        }

    session = DirectChatSession(
        id=str(uuid.uuid4()),
        initiator_id=current_user.id,
        partner_id=partner.id,
        title=body.title,
        status="active",
        twin_mode=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session": _serialize_session(session, current_user.id),
        "created": True,
    }


@router.get("/sessions")
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all twin-chat sessions for the current user."""
    sessions = db.query(DirectChatSession).filter(
        DirectChatSession.status != "archived",
        or_(
            DirectChatSession.initiator_id == current_user.id,
            DirectChatSession.partner_id == current_user.id,
        )
    ).order_by(desc(DirectChatSession.updated_at)).all()

    return {"sessions": [_serialize_session(s, current_user.id) for s in sessions]}


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str,
    limit: int = Query(50, le=200),
    before: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get session detail with paginated messages."""
    session = db.query(DirectChatSession).filter(
        DirectChatSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in (session.initiator_id, session.partner_id):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    q = db.query(DirectChatMessage).filter(
        DirectChatMessage.session_id == session_id,
        DirectChatMessage.status != "rejected",
    )
    if before:
        q = q.filter(DirectChatMessage.created_at < before)
    messages = q.order_by(DirectChatMessage.created_at).limit(limit).all()

    return {
        "session": _serialize_session(session, current_user.id),
        "messages": [_serialize_message(m) for m in messages],
    }


# ────────────────────────────────────────────────────────────────────
# Message Endpoints
# ────────────────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: str,
    body: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send a human message in the session.
    - Persists the message.
    - Notifies partner via WebSocket.
    - Asynchronously generates Twin enrichment + suggestions for partner.
    """
    session = db.query(DirectChatSession).filter(
        DirectChatSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in (session.initiator_id, session.partner_id):
        raise HTTPException(status_code=403, detail="Not a participant")

    now = datetime.now(timezone.utc)
    msg = DirectChatMessage(
        id=str(uuid.uuid4()),
        session_id=session_id,
        sender_id=current_user.id,
        sender_type="human",
        status="sent",
        content=body.content,
        created_at=now,
        updated_at=now,
    )
    db.add(msg)
    session.updated_at = now
    session.last_message_at = now
    db.commit()
    db.refresh(msg)

    # Index this message in sender's memory
    partner_id = session.partner_id if session.initiator_id == current_user.id else session.initiator_id
    partner = db.query(User).filter(User.id == partner_id).first()
    partner_name = partner.name if partner else "Partner"

    store_message_in_memory(
        user_id=current_user.id,
        session_id=session_id,
        message_id=msg.id,
        content=body.content,
        sender_name=current_user.name or "You",
        partner_name=partner_name,
        is_outgoing=True,
    )

    serialized = _serialize_message(msg)

    # Broadcast new message to both participants
    await manager.broadcast_to_session(session, {
        "event": "new_message",
        "message": serialized,
    })

    # Generate Twin enrichment for the PARTNER (recipient)
    # This runs synchronously for now (can be moved to background task)
    if session.twin_mode:
        try:
            recent_msgs = db.query(DirectChatMessage).filter(
                DirectChatMessage.session_id == session_id,
                DirectChatMessage.status != "rejected",
            ).order_by(desc(DirectChatMessage.created_at)).limit(10).all()
            history = _get_history_dicts(list(reversed(recent_msgs)))

            enrichment_data = generate_twin_enrichment(
                user=partner,
                incoming_message=body.content,
                conversation_history=history,
                partner_name=current_user.name or "Sender",
                partner_id=current_user.id,
            )

            # Create a pending Twin suggestion message visible only to partner
            if enrichment_data.get("suggestions"):
                twin_msg = DirectChatMessage(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    sender_id=partner_id,
                    sender_type="twin",
                    status="pending",
                    content=enrichment_data["suggestions"][0]["content"],
                    suggestions_json=json.dumps(enrichment_data["suggestions"]),
                    memory_context=enrichment_data.get("enrichment", ""),
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(twin_msg)
                db.commit()
                db.refresh(twin_msg)

                # Only send Twin suggestion to the partner
                await manager.send_to_user(partner_id, {
                    "event": "twin_suggestion",
                    "message": _serialize_message(twin_msg),
                    "enrichment": enrichment_data.get("enrichment", ""),
                })
        except Exception as e:
            logger.error(f"[TwinChat] Partner enrichment failed: {e}")

    return {"message": serialized}


@router.post("/sessions/{session_id}/suggest")
def get_suggestions(
    session_id: str,
    body: SuggestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ask the Twin to generate reply suggestions for the current user."""
    session = db.query(DirectChatSession).filter(
        DirectChatSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in (session.initiator_id, session.partner_id):
        raise HTTPException(status_code=403, detail="Not a participant")

    partner_id = session.partner_id if session.initiator_id == current_user.id else session.initiator_id
    partner = db.query(User).filter(User.id == partner_id).first()
    partner_name = partner.name if partner else "Partner"

    result = generate_twin_enrichment(
        user=current_user,
        incoming_message=body.incoming_message,
        conversation_history=body.conversation_history,
        partner_name=partner_name,
        partner_id=partner_id,
    )

    return {
        "enrichment": result.get("enrichment", ""),
        "suggestions": result.get("suggestions", []),
    }


@router.post("/sessions/{session_id}/enhance")
def enhance_draft(
    session_id: str,
    body: EnhanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Polish/enhance a user's draft message with Twin assistance."""
    session = db.query(DirectChatSession).filter(
        DirectChatSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in (session.initiator_id, session.partner_id):
        raise HTTPException(status_code=403, detail="Not a participant")

    partner_id = session.partner_id if session.initiator_id == current_user.id else session.initiator_id
    partner = db.query(User).filter(User.id == partner_id).first()
    partner_name = partner.name if partner else "Partner"

    enhanced = generate_twin_suggestion_only(
        user=current_user,
        user_draft=body.draft,
        conversation_history=body.conversation_history,
        partner_name=partner_name,
    )

    return {"enhanced": enhanced}


@router.post("/sessions/{session_id}/approve/{message_id}")
async def approve_twin_message(
    session_id: str,
    message_id: str,
    body: ApproveMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve (and optionally edit) a Twin-generated suggestion, sending it to the partner."""
    session = db.query(DirectChatSession).filter(
        DirectChatSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    msg = db.query(DirectChatMessage).filter(
        DirectChatMessage.id == message_id,
        DirectChatMessage.session_id == session_id,
        DirectChatMessage.sender_id == current_user.id,
        DirectChatMessage.status == "pending",
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Pending suggestion not found")

    # Override content if user edited before sending
    if body.content:
        msg.content = body.content

    msg.status = "approved"
    msg.sender_type = "human"   # re-classified as human-approved
    msg.updated_at = datetime.now(timezone.utc)
    session.last_message_at = msg.updated_at
    db.commit()
    db.refresh(msg)

    # Store in memory
    partner_id = session.partner_id if session.initiator_id == current_user.id else session.initiator_id
    partner = db.query(User).filter(User.id == partner_id).first()
    store_message_in_memory(
        user_id=current_user.id,
        session_id=session_id,
        message_id=msg.id,
        content=msg.content,
        sender_name=current_user.name or "You",
        partner_name=partner.name if partner else "Partner",
        is_outgoing=True,
    )

    serialized = _serialize_message(msg)

    # Broadcast the approved message to both
    await manager.broadcast_to_session(session, {
        "event": "new_message",
        "message": serialized,
    })

    return {"message": serialized}


@router.delete("/sessions/{session_id}/messages/{message_id}")
def reject_message(
    session_id: str,
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject/dismiss a Twin suggestion."""
    msg = db.query(DirectChatMessage).filter(
        DirectChatMessage.id == message_id,
        DirectChatMessage.session_id == session_id,
        DirectChatMessage.sender_id == current_user.id,
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    msg.status = "rejected"
    msg.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/sessions/{session_id}/summarize")
def summarize_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and store a summary of the session conversation."""
    session = db.query(DirectChatSession).filter(
        DirectChatSession.id == session_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in (session.initiator_id, session.partner_id):
        raise HTTPException(status_code=403, detail="Not a participant")

    messages = db.query(DirectChatMessage).filter(
        DirectChatMessage.session_id == session_id,
        DirectChatMessage.status.in_(["sent", "approved"]),
    ).order_by(DirectChatMessage.created_at).all()

    msg_dicts = [
        {
            "sender_name": m.sender.name if m.sender else "User",
            "content": m.content,
        }
        for m in messages
    ]

    summary = summarize_conversation(
        user_id=current_user.id,
        session_id=session_id,
        messages=msg_dicts,
    )

    return {"summary": summary}


# ────────────────────────────────────────────────────────────────────
# User Search
# ────────────────────────────────────────────────────────────────────

@router.get("/users/search")
def search_users(
    q: str = Query("", min_length=1),
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search for users to start a twin chat with."""
    query_str = f"%{q}%"
    users = db.query(User).filter(
        User.id != current_user.id,
        User.is_active == True,
        or_(
            User.name.ilike(query_str),
            User.email.ilike(query_str),
        )
    ).limit(limit).all()

    return {
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
            }
            for u in users
        ]
    }


# ────────────────────────────────────────────────────────────────────
# WebSocket Endpoint
# ────────────────────────────────────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    """
    Global real-time WebSocket for twin-chat.
    Client must pass `?token=<jwt>` in the query string.

    Events sent by server:
      - connected       → connection confirmed
      - new_message     → new message in ANY session for this user
      - twin_suggestion → Twin-generated suggestion
      - partner_typing  → typing indicator from a partner
      - error           → error message

    Events sent by client (JSON):
      - { "event": "typing", "session_id": "..." }
      - { "event": "stop_typing", "session_id": "..." }
      - { "event": "ping" }
    """
    # Authenticate via token
    from db.auth import decode_token
    from security.firebase_config import verify_firebase_token

    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    user = None
    payload = decode_token(token)
    if payload and "sub" in payload:
        user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        fb_decoded = verify_firebase_token(token)
        if fb_decoded and "uid" in fb_decoded:
            user = db.query(User).filter(User.id == fb_decoded["uid"]).first()
    if not user:
        await websocket.close(code=4001)
        return

    await manager.connect(user.id, websocket)
    try:
        await manager.send_to_user(user.id, {
            "event": "connected",
            "user_id": user.id,
        })

        while True:
            data = await websocket.receive_json()
            event = data.get("event")
            sid = data.get("session_id")

            if event == "ping":
                await manager.send_to_user(user.id, {"event": "pong"})

            elif event == "typing" and sid:
                # Need to find session participants to broadcast typing
                session = db.query(DirectChatSession).filter(DirectChatSession.id == sid).first()
                if session and user.id in (session.initiator_id, session.partner_id):
                    await manager.broadcast_to_session(session, {
                        "event": "partner_typing",
                        "session_id": sid,
                        "user_id": user.id,
                        "user_name": user.name,
                    }, exclude_user_id=user.id)

            elif event == "stop_typing" and sid:
                session = db.query(DirectChatSession).filter(DirectChatSession.id == sid).first()
                if session and user.id in (session.initiator_id, session.partner_id):
                    await manager.broadcast_to_session(session, {
                        "event": "partner_stop_typing",
                        "session_id": sid,
                        "user_id": user.id,
                    }, exclude_user_id=user.id)

    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
    except Exception as e:
        logger.error(f"[WS] Error for {user.id}: {e}")
        manager.disconnect(user.id, websocket)
