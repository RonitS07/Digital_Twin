"""
Agent Registry Service
Handles Twin registration, discovery, presence management, and in-process inbox delivery.

Privacy rule: This service ONLY exposes public profile data (display_name, handle,
capabilities, status). It never surfaces memory, tokens, calendar details, or emails.
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from db.models import AgentRegistry, User

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# In-process inbox queues (Sprint 1: asyncio.Queue per connected user)
# Sprint 2 upgrade path: swap with Redis pub/sub for multi-instance support
# ─────────────────────────────────────────────────────────────────────────────

_inbox_queues: dict[str, asyncio.Queue] = {}


def get_inbox_queue(user_id: str) -> asyncio.Queue:
    """Get or create the asyncio inbox queue for a user."""
    if user_id not in _inbox_queues:
        _inbox_queues[user_id] = asyncio.Queue(maxsize=100)
    return _inbox_queues[user_id]


async def push_to_inbox(user_id: str, message: dict) -> None:
    """Non-blocking push of a message dict to a user's in-process inbox queue."""
    q = get_inbox_queue(user_id)
    try:
        q.put_nowait(message)
        logger.info(f"[Agent Broker] Pushed msg to inbox of {user_id}")
    except asyncio.QueueFull:
        logger.warning(f"[Agent Broker] Inbox full for {user_id} — message dropped")


# ─────────────────────────────────────────────────────────────────────────────
# Handle generation
# ─────────────────────────────────────────────────────────────────────────────

def _derive_handle(name: str, email: str) -> str:
    """Derive a unique, clean handle from a user's email prefix or name."""
    # M4 FIX: Use only the email prefix (before @) to avoid exposing full email in public handle.
    if email and "@" in email:
        prefix = email.split("@")[0].lower()
        # Clean to alphanumeric+underscore only
        clean = re.sub(r"[^a-z0-9_]", "", prefix)
        if clean:
            return clean

    # Fall back to name
    if name:
        handle = re.sub(r"[^a-z0-9]", "", name.lower())
        if handle:
            return handle

    return "twin"


def _unique_handle(db: Session, base_handle: str, user_id: str) -> str:
    """Ensure handle is unique — append numeric suffix if needed."""
    handle = base_handle
    suffix = 1
    while True:
        existing = (
            db.query(AgentRegistry)
            .filter(AgentRegistry.handle == handle, AgentRegistry.user_id != user_id)
            .first()
        )
        if not existing:
            return handle
        handle = f"{base_handle}{suffix}"
        suffix += 1


# ─────────────────────────────────────────────────────────────────────────────
# Core registry operations
# ─────────────────────────────────────────────────────────────────────────────

def register_agent(db: Session, user: User) -> AgentRegistry:
    """Register or update a user's Twin in the agent registry.
    Called automatically on login/signup. Idempotent.
    """
    existing = db.query(AgentRegistry).filter(AgentRegistry.user_id == user.id).first()

    agent_endpoint = f"/agent/{user.id}/receive"

    if existing:
        # Update last_seen, display_name
        existing.display_name = user.name or existing.display_name
        
        # M4 FIX: Do not overwrite the handle with the full email address.
        # If the handle is missing or is still an email address, derive a secure alphanumeric handle from the prefix.
        if not existing.handle or "@" in existing.handle:
            base_handle = _derive_handle(user.name or "", user.email or "")
            existing.handle = _unique_handle(db, base_handle, user.id)
            
        existing.last_seen = datetime.now(timezone.utc)
        existing.agent_endpoint = agent_endpoint
        db.commit()
        db.refresh(existing)
        logger.info(f"[Agent Registry] Updated registration for {user.id} (@{existing.handle})")
        return existing

    # Auto-generate handle from name/email
    base_handle = _derive_handle(user.name or "", user.email or "")
    handle = _unique_handle(db, base_handle, user.id)

    agent = AgentRegistry(
        user_id=user.id,
        display_name=user.name or "Twin User",
        handle=handle,
        agent_endpoint=agent_endpoint,
        capabilities=json.dumps(["scheduling", "messaging"]),
        status="online",
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    logger.info(f"[Agent Registry] Registered new agent for {user.id} (@{handle})")
    return agent


def lookup_agent(db: Session, user_id: str) -> Optional[AgentRegistry]:
    """Look up an agent by Firebase UID."""
    return db.query(AgentRegistry).filter(AgentRegistry.user_id == user_id).first()


def search_agent_by_handle(db: Session, handle: str) -> Optional[AgentRegistry]:
    """Look up an agent by @handle (case-insensitive)."""
    clean = handle.lstrip("@").lower().strip()
    return db.query(AgentRegistry).filter(AgentRegistry.handle == clean).first()


def list_online_agents(db: Session, exclude_user_id: Optional[str] = None) -> list[dict]:
    query = db.query(AgentRegistry, User.email).join(User, AgentRegistry.user_id == User.id).filter(AgentRegistry.status != "do_not_disturb")
    if exclude_user_id:
        query = query.filter(AgentRegistry.user_id != exclude_user_id)
    results = query.all()
    return [_public_profile(row.AgentRegistry, row.email) for row in results]


def update_agent_status(db: Session, user_id: str, status: str) -> bool:
    """Update presence status: online | busy | do_not_disturb."""
    valid = {"online", "busy", "do_not_disturb"}
    if status not in valid:
        return False
    agent = lookup_agent(db, user_id)
    if not agent:
        return False
    agent.status = status
    agent.last_seen = datetime.now(timezone.utc)
    db.commit()
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Public profile serialisation (privacy boundary)
# ─────────────────────────────────────────────────────────────────────────────

def _public_profile(agent: AgentRegistry, email: str = None) -> dict:
    """Serialise ONLY public-safe fields — never memory, tokens, calendar data.
    M5 FIX: email removed from public profile to prevent email harvesting.
    Email is only surfaced in admin-specific endpoints.
    """
    try:
        caps = json.loads(agent.capabilities or "[]")
    except Exception:
        caps = []
    
    return {
        "user_id": agent.user_id,
        "display_name": agent.display_name,
        "handle": agent.handle,
        # email intentionally omitted — M5 FIX
        "capabilities": caps,
        "status": agent.status,
        "agent_endpoint": agent.agent_endpoint,
    }


def get_public_profile(db: Session, user_id: str) -> Optional[dict]:
    """Get the public profile of an agent by user_id."""
    result = (
        db.query(AgentRegistry, User.email)
        .join(User, AgentRegistry.user_id == User.id)
        .filter(AgentRegistry.user_id == user_id)
        .first()
    )
    if not result:
        return None
    return _public_profile(result.AgentRegistry, result.email)


def get_public_profile_by_handle(db: Session, handle: str) -> Optional[dict]:
    """Get the public profile of an agent by handle."""
    clean = handle.lstrip("@").lower().strip()
    result = (
        db.query(AgentRegistry, User.email)
        .join(User, AgentRegistry.user_id == User.id)
        .filter(AgentRegistry.handle == clean)
        .first()
    )
    if not result:
        return None
    return _public_profile(result.AgentRegistry, result.email)
