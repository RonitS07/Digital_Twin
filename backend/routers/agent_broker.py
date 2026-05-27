"""
Agent Broker Router  (/agent/*)
All cross-twin communication flows through here.

Endpoints:
  POST   /agent/send                  — Send an A2A message to another Twin
  POST   /agent/{user_id}/receive     — Internal: deliver a message to a Twin's inbox
  GET    /agent/discover/{handle}     — Public profile lookup (no private data)
  GET    /agent/registry              — List all discoverable agents
  GET    /agent/inbox                 — Current user's pending inbox messages
  POST   /agent/inbox/{msg_id}/approve — HITL approve a cross-twin action
  POST   /agent/inbox/{msg_id}/reject  — HITL reject a cross-twin action
  PUT    /agent/status                — Update own presence status
  POST   /agent/schedule              — High-level: initiate scheduling negotiation
  WS     /agent/ws/{user_id}          — Real-time inbox push via WebSocket
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from security.rate_limit import limiter
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from db.database import get_db
from db.models import A2AMessageLog, AgentRegistry, User
from schemas.a2a_message import A2AMessage
from services.agent_registry import (
    get_public_profile,
    get_public_profile_by_handle,
    list_online_agents,
    lookup_agent,
    push_to_inbox,
    get_inbox_queue,
    register_agent,
    search_agent_by_handle,
    update_agent_status,
)
from services.scheduling_negotiation import book_confirmed_meeting, find_common_slots

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["multi-agent"])

_security = HTTPBearer(auto_error=False)


def get_current_user_router(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
    db: Session = Depends(get_db),
) -> User:
    """Auth dependency for agent broker — mirrors central security.auth.get_current_user."""
    from security.auth import get_current_user
    return get_current_user(credentials, db)


def set_auth_dependency(dep):
    """No-op kept for compatibility — router now has its own auth logic."""
    pass


# ─────────────────────────────────────────────────────────────────────────────
# Request models
# ─────────────────────────────────────────────────────────────────────────────

class ScheduleWithRequest(BaseModel):
    target_handle: str            # @handle or handle of the target Twin
    duration_minutes: int = 30
    lookahead_days: int = 7
    topic: Optional[str] = "Meeting"
    start_date: Optional[str] = None  # Suggest a specific date/time (ISO)
    notify_email: bool = False       # Send email along with the request


class StatusUpdateRequest(BaseModel):
    status: str   # online | busy | do_not_disturb


# ─────────────────────────────────────────────────────────────────────────────
# Helper: persist message to DB
# ─────────────────────────────────────────────────────────────────────────────

def _persist_message(db: Session, msg: A2AMessage, status: str = "pending") -> A2AMessageLog:
    log = A2AMessageLog(
        msg_id=msg.msg_id,
        sender_user_id=msg.sender_user_id,
        receiver_user_id=msg.receiver_user_id,
        msg_type=msg.msg_type,
        payload_json=json.dumps(msg.payload),
        trace_json=json.dumps(msg.trace) if msg.trace else None,
        status=status,
        requires_hitl=msg.requires_hitl,
        created_at=datetime.now(timezone.utc),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def _send_scheduling_email(db: Session, sender: User, receiver: User, topic: str):
    """Notify the receiver via email about the new scheduling proposal."""
    from utils.email_templates import get_proposal_html
    import os
    
    subject = f"📅 Meeting Proposal from @{sender.name or 'AI Twin'}"
    # Use the premium HTML template
    dashboard_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    html = get_proposal_html(sender.name or "User", receiver.name or "Contact", topic, dashboard_url)
    
    try:
        # Sender's twin sends the email to receiver's email
        from tools.gmail_tool import send_styled_invite
        send_styled_invite(db, sender.id, receiver.email, subject, html)
        logger.info(f"[Broker] Scheduling email sent from {sender.id} to {receiver.email}")
    except Exception as e:
        logger.error(f"[Broker] Failed to send scheduling email: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_message(
    msg: A2AMessage,
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """Send an A2A message from the authenticated user's Twin to another Twin.
    The sender MUST be the authenticated user (privacy enforcement).
    """
    # Enforce sender authenticity
    if msg.sender_user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="sender_user_id must match the authenticated user",
        )

    # Look up receiver
    receiver_agent = lookup_agent(db, msg.receiver_user_id)
    if not receiver_agent:
        raise HTTPException(status_code=404, detail="Target agent not found or not registered")

    if receiver_agent.status == "do_not_disturb":
        raise HTTPException(
            status_code=503,
            detail="Target agent is in Do Not Disturb mode. Try again later.",
        )

    # Persist to DB (durable inbox)
    log = _persist_message(db, msg, status="delivered")

    # Push to in-process queue for real-time WebSocket delivery
    await push_to_inbox(msg.receiver_user_id, {
        "msg_id": msg.msg_id,
        "sender_user_id": msg.sender_user_id,
        "msg_type": msg.msg_type,
        "payload": msg.payload,
        "requires_hitl": msg.requires_hitl,
        "timestamp": msg.timestamp,
    })

    logger.info(
        f"[Broker] {current_user.id} → {msg.receiver_user_id}: {msg.msg_type} (msg_id={msg.msg_id})"
    )
    return {"status": "delivered", "msg_id": msg.msg_id}


@router.post("/{user_id}/receive")
@limiter.limit("20/minute")
async def receive_message(
    request: Request,
    user_id: str,
    msg: A2AMessage,
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """Internal inbox endpoint — called by the broker to deliver a message.
    In production this would be protected by an inter-service secret/mTLS.
    For Sprint 1 it's an internal-only path not exposed to the frontend.
    """
    # Enforce ownership validation and derive identity from auth token
    if msg.sender_user_id and msg.sender_user_id != current_user.id:
        logger.warning(json.dumps({"event": "forged_sender_attempt", "user_id": current_user.id, "attempted_sender": msg.sender_user_id}))
        raise HTTPException(status_code=403, detail="sender_user_id must match the authenticated user")
    
    msg.sender_user_id = current_user.id
    msg.receiver_user_id = user_id
    
    # Replay protection: Check if msg_id already exists
    existing = db.query(A2AMessageLog).filter(A2AMessageLog.msg_id == msg.msg_id).first()
    if existing:
        logger.warning(json.dumps({"event": "replay_attack_attempt", "msg_id": msg.msg_id, "user_id": current_user.id}))
        raise HTTPException(status_code=409, detail="Duplicate message ID")

    # Structured audit logging
    logger.info(json.dumps({
        "event": "message_received",
        "msg_id": msg.msg_id,
        "sender": msg.sender_user_id,
        "receiver": msg.receiver_user_id,
        "type": msg.msg_type
    }))

    log = _persist_message(db, msg, status="delivered")
    await push_to_inbox(user_id, {
        "msg_id": msg.msg_id,
        "sender_user_id": msg.sender_user_id,
        "msg_type": msg.msg_type,
        "payload": msg.payload,
        "requires_hitl": msg.requires_hitl,
        "timestamp": msg.timestamp,
    })
    return {"status": "received", "msg_id": msg.msg_id}


@router.get("/discover/{handle_or_id}")
def discover_agent(
    handle_or_id: str,
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """Returns the PUBLIC profile of an agent by @handle or user_id.
    Privacy: only display_name, handle, capabilities, status are returned.
    Memory, tokens, calendar data, and emails are NEVER included.
    """
    # Try as handle first, then as user_id
    profile = get_public_profile_by_handle(db, handle_or_id)
    if not profile:
        profile = get_public_profile(db, handle_or_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Strip internal fields just in case
    return {
        "display_name": profile["display_name"],
        "handle": profile["handle"],
        "capabilities": profile["capabilities"],
        "status": profile["status"],
    }


@router.get("/registry")
def list_agents(
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """Returns public profiles of all discoverable agents (excludes DND + self)."""
    agents = list_online_agents(db, exclude_user_id=current_user.id)
    return {"agents": agents, "count": len(agents)}


@router.get("/inbox")
def get_inbox(
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """Return all pending A2A messages in the current user's inbox (DB-backed)."""
    messages = (
        db.query(A2AMessageLog)
        .filter(
            A2AMessageLog.receiver_user_id == current_user.id,
            A2AMessageLog.status.in_(["pending", "delivered"]),
        )
        .order_by(A2AMessageLog.created_at.desc())
        .limit(50)
        .all()
    )
    result = []
    for m in messages:
        try:
            payload = json.loads(m.payload_json)
        except Exception:
            payload = {}
        # Enrich with sender's public profile
        sender_profile = get_public_profile(db, m.sender_user_id) or {}
        result.append({
            "msg_id": m.msg_id,
            "msg_type": m.msg_type,
            "status": m.status,
            "requires_hitl": m.requires_hitl,
            "payload": payload,
            "created_at": m.created_at.isoformat(),
            "sender": {
                "display_name": sender_profile.get("display_name", "Unknown"),
                "handle": sender_profile.get("handle"),
            },
        })
    return {"messages": result, "count": len(result)}


@router.post("/inbox/{msg_id}/approve")
async def approve_message(
    msg_id: str,
    slot_index: int = 0,
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """HITL approval — user approves the cross-twin action described in msg_id.
    For scheduling_proposal: automatically sends scheduling_confirm to sender.
    For scheduling_confirm: books the calendar event for both parties.
    """
    msg_log = (
        db.query(A2AMessageLog)
        .filter(
            A2AMessageLog.msg_id == msg_id,
            A2AMessageLog.receiver_user_id == current_user.id,
        )
        .first()
    )
    if not msg_log:
        raise HTTPException(status_code=404, detail="Message not found in your inbox")

    if msg_log.status in ("approved", "rejected"):
        raise HTTPException(status_code=409, detail=f"Message already {msg_log.status}")

    try:
        payload = json.loads(msg_log.payload_json)
    except Exception:
        payload = {}

    msg_log.status = "approved"
    msg_log.updated_at = datetime.now(timezone.utc)
    db.commit()

    # ── scheduling_proposal → send scheduling_confirm back to sender ──────────
    if msg_log.msg_type == "scheduling_proposal":
        proposed_slots = payload.get("proposed_slots", [])
        if not proposed_slots:
            return {"status": "approved", "action": "no_slots_to_confirm"}

        # Pick the user's selected slot or default to first
        chosen_slot = proposed_slots[slot_index] if slot_index < len(proposed_slots) else proposed_slots[0]
        topic = payload.get("topic", "Meeting")

        confirm_msg = A2AMessage(
            sender_user_id=current_user.id,
            receiver_user_id=msg_log.sender_user_id,
            msg_type="scheduling_confirm",
            payload={
                "slot": chosen_slot,
                "event_title": topic,
                "confirmed_by": current_user.id,
            },
            requires_hitl=True,
        )
        confirm_log = _persist_message(db, confirm_msg, status="delivered")
        await push_to_inbox(msg_log.sender_user_id, {
            "msg_id": confirm_msg.msg_id,
            "sender_user_id": confirm_msg.sender_user_id,
            "msg_type": confirm_msg.msg_type,
            "payload": confirm_msg.payload,
            "requires_hitl": confirm_msg.requires_hitl,
            "timestamp": confirm_msg.timestamp,
        })
        return {
            "status": "approved",
            "action": "scheduling_confirm_sent",
            "confirm_msg_id": confirm_msg.msg_id,
        }

    # ── scheduling_confirm → both parties approve → BOOK THE MEETING ──────────
    if msg_log.msg_type == "scheduling_confirm":
        slot = payload.get("slot", {})
        event_title = payload.get("event_title", "Meeting")

        if not slot:
            return {"status": "approved", "action": "no_slot_in_confirm"}

        booking = book_confirmed_meeting(
            db=db,
            user_a_id=msg_log.sender_user_id,
            user_b_id=current_user.id,
            slot=slot,
            event_title=event_title,
            description=f"Scheduled via AI Twin Agent — {event_title}",
        )
        
        # 🟢 Send Styled Confirmation Email to both
        from utils.email_templates import get_invite_html
        from tools.gmail_tool import send_styled_invite
        
        user_a = db.query(User).filter(User.id == msg_log.sender_user_id).first()
        user_b = current_user
        
        meet_link = booking.get("user_a_event", {}).get("meet_link") or ""
        confirm_subject = f"✅ Scheduled: {event_title}"
        confirm_html = get_invite_html(
            title=event_title,
            start_time=slot["start"],
            end_time=slot["end"],
            meet_link=meet_link,
            description=f"Scheduled via AI Twin Agent — {event_title}",
            user_name=user_a.name or "AI Twin",
            attendees=[user_a.email, user_b.email]
        )
        
        try:
            send_styled_invite(db, user_a.id, user_a.email, confirm_subject, confirm_html)
            send_styled_invite(db, user_a.id, user_b.email, confirm_subject, confirm_html)
        except Exception as email_err:
            logger.warning(f"[Scheduling] Failed to send confirmation emails: {email_err}")

        return {
            "status": "approved",
            "action": "meeting_booked",
            "booking": booking,
        }

    # Generic approval (agent_chat, capability_query, etc.)
    return {"status": "approved", "msg_id": msg_id}


@router.post("/inbox/{msg_id}/reject")
async def reject_message(
    msg_id: str,
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """HITL rejection — sends scheduling_reject back to the sender."""
    msg_log = (
        db.query(A2AMessageLog)
        .filter(
            A2AMessageLog.msg_id == msg_id,
            A2AMessageLog.receiver_user_id == current_user.id,
        )
        .first()
    )
    if not msg_log:
        raise HTTPException(status_code=404, detail="Message not found in your inbox")

    if msg_log.status in ("approved", "rejected"):
        raise HTTPException(status_code=409, detail=f"Message already {msg_log.status}")

    msg_log.status = "rejected"
    msg_log.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Notify the original sender
    reject_msg = A2AMessage(
        sender_user_id=current_user.id,
        receiver_user_id=msg_log.sender_user_id,
        msg_type="scheduling_reject",
        payload={"rejected_msg_id": msg_id, "reason": "User declined"},
        requires_hitl=False,
    )
    _persist_message(db, reject_msg, status="delivered")
    await push_to_inbox(msg_log.sender_user_id, {
        "msg_id": reject_msg.msg_id,
        "sender_user_id": reject_msg.sender_user_id,
        "msg_type": reject_msg.msg_type,
        "payload": reject_msg.payload,
        "requires_hitl": reject_msg.requires_hitl,
        "timestamp": reject_msg.timestamp,
    })

    return {"status": "rejected", "msg_id": msg_id}


@router.put("/status")
def update_status(
    req: StatusUpdateRequest,
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """Update the current Twin's presence status: online | busy | do_not_disturb."""
    ok = update_agent_status(db, current_user.id, req.status)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail="Invalid status. Use: online, busy, do_not_disturb",
        )
    return {"status": "updated", "new_status": req.status}


@router.post("/schedule")
async def initiate_scheduling(
    req: ScheduleWithRequest,
    current_user: User = Depends(get_current_user_router),
    db: Session = Depends(get_db),
):
    """
    High-level endpoint: initiate a scheduling negotiation with another Twin.

    Flow:
    1. Look up target Twin by handle
    2. Find common free slots (privacy-safe: no calendar details exchanged)
    3. Send scheduling_request → scheduling_proposal to target
    4. Return proposed slots to calling user for confirmation
    """
    # 1. Resolve target
    target_agent = search_agent_by_handle(db, req.target_handle)
    if not target_agent:
        raise HTTPException(
            status_code=404,
            detail=f"Agent @{req.target_handle.lstrip('@')} not found in registry",
        )

    if target_agent.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot schedule a meeting with yourself")

    if target_agent.status == "do_not_disturb":
        raise HTTPException(
            status_code=503,
            detail=f"@{target_agent.handle}'s Twin is in Do Not Disturb mode",
        )

    # 2. Find common free slots
    common_slots = await find_common_slots(
        db=db,
        user_a_id=current_user.id,
        user_b_id=target_agent.user_id,
        duration_minutes=req.duration_minutes,
        lookahead_days=req.lookahead_days,
        start_date_suggested=req.start_date, # Now support specific starting point
    )

    if not common_slots:
        return {
            "status": "no_slots_found",
            "message": f"No common availability found with @{target_agent.handle} in the next {req.lookahead_days} days.",
        }

    # 3. Send scheduling_proposal to target Twin's inbox
    proposal_msg = A2AMessage(
        sender_user_id=current_user.id,
        receiver_user_id=target_agent.user_id,
        msg_type="scheduling_proposal",
        payload={
            "proposed_slots": common_slots,
            "duration_minutes": req.duration_minutes,
            "topic": req.topic,
        },
        requires_hitl=True,
    )
    _persist_message(db, proposal_msg, status="delivered")
    await push_to_inbox(target_agent.user_id, {
        "msg_id": proposal_msg.msg_id,
        "sender_user_id": proposal_msg.sender_user_id,
        "msg_type": proposal_msg.msg_type,
        "payload": proposal_msg.payload,
        "requires_hitl": proposal_msg.requires_hitl,
        "timestamp": proposal_msg.timestamp,
    })
    
    # 4. (Optional) Notify via Email
    if req.notify_email and target_agent.user and target_agent.user.email:
        _send_scheduling_email(db, current_user, target_agent.user, req.topic)

    logger.info(
        f"[Broker] Scheduling proposal sent: {current_user.id} → @{target_agent.handle} "
        f"({len(common_slots)} slots, topic={req.topic})"
    )

    return {
        "status": "proposal_sent",
        "msg_id": proposal_msg.msg_id,
        "target_handle": target_agent.handle,
        "target_display_name": target_agent.display_name,
        "proposed_slots": common_slots,
        "message": (
            f"I've sent {len(common_slots)} available slot(s) to @{target_agent.handle}'s Twin. "
            f"They'll need to approve before anything is booked."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket — real-time inbox push
# ─────────────────────────────────────────────────────────────────────────────

MAX_PAYLOAD_BYTES = 65_536

async def receive_safe(websocket: WebSocket) -> dict:
    raw = await websocket.receive()
    text = raw.get("text") or ""
    data_bytes = raw.get("bytes") or b""
    payload_len = len(text.encode("utf-8")) if text else len(data_bytes)
    if payload_len > MAX_PAYLOAD_BYTES:
        logger.warning(f"[WS] Payload too large: {payload_len} bytes — closing 4008")
        await websocket.close(code=4008, reason="Payload too large")
        raise WebSocketDisconnect(code=4008)
    try:
        import json
        return json.loads(text or data_bytes.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.warning(f"[WS] Invalid JSON payload: {exc}")
        raise WebSocketDisconnect(code=4000)


@router.websocket("/ws/{user_id}")
async def inbox_websocket(websocket: WebSocket, user_id: str, db: Session = Depends(get_db)):
    """Real-time WebSocket endpoint — pushes incoming A2A messages to the frontend.
    C5/M6 FIX: First-frame authentication + payload size enforcement.
    """
    await websocket.accept()

    # 1. First-frame authentication (5-second timeout)
    try:
        auth_frame = await asyncio.wait_for(receive_safe(websocket), timeout=5.0)
    except asyncio.TimeoutError:
        try:
            await websocket.send_json({"event": "error", "code": "AUTH_TIMEOUT", "message": "Auth frame not received within 5 seconds."})
            await websocket.close(code=4008)
        except Exception:
            pass
        return
    except WebSocketDisconnect:
        return

    if auth_frame.get("event") != "auth" or not auth_frame.get("token"):
        try:
            await websocket.send_json({"event": "error", "code": "AUTH_REQUIRED", "message": "First frame must be {event: 'auth', token: '...'}."})
            await websocket.close(code=4001)
        except Exception:
            pass
        return

    token = auth_frame["token"]

    # 2. Token validation
    from db.auth import decode_token
    payload = decode_token(token)
    if not payload:
        try:
            await websocket.send_json({"event": "error", "code": "UNAUTHORIZED", "message": "Invalid token."})
            await websocket.close(code=4002)
        except Exception:
            pass
        return

    if payload.get("error") == "ExpiredIdTokenError":
        try:
            await websocket.send_json({"event": "error", "code": "TOKEN_EXPIRED", "message": "Token expired."})
            await websocket.close(code=4003)
        except Exception:
            pass
        return

    if payload.get("sub") != user_id:
        try:
            await websocket.send_json({"event": "error", "code": "UNAUTHORIZED", "message": "Unauthorized user ID."})
            await websocket.close(code=4002)
        except Exception:
            pass
        return

    logger.info(f"[WS] Agent inbox WebSocket authenticated and connected: {user_id}")

    q = get_inbox_queue(user_id)
    try:
        while True:
            try:
                # Wait up to 30s for a new message
                message = await asyncio.wait_for(q.get(), timeout=30.0)
                await websocket.send_json(message)
                logger.info(f"[WS] Pushed message to {user_id}: {message.get('msg_type')}")
            except asyncio.TimeoutError:
                # Send heartbeat ping to keep connection alive
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        logger.info(f"[WS] Agent inbox WebSocket disconnected: {user_id}")
    except Exception as e:
        logger.error(f"[WS] WebSocket error for {user_id}: {e}")
