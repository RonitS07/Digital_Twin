from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.database import Base
from datetime import datetime
import uuid

class User(Base):
    __tablename__ = "users"

    id              = Column(String, primary_key=True) # Firebase UID
    email           = Column(String, unique=True, nullable=False, index=True)
    name            = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True) # Allow null for Firebase/OAuth users
    is_active       = Column(Boolean, default=True)
    telegram_chat_id = Column(String, unique=True, nullable=True, index=True)
    telegram_enabled = Column(Boolean, default=False)
    preferences_json = Column(Text, default="{}")
    last_briefing_at = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    tasks           = relationship("TaskLog", back_populates="user")

class TaskLog(Base):
    __tablename__ = "task_logs"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(String, ForeignKey("users.id"), nullable=True)  # Firebase UID as String
    session_id = Column(String, nullable=True, index=True)
    kind       = Column(String, nullable=False, default="prompt")  # prompt|approval|execution|session
    input      = Column(Text, nullable=False)
    intent     = Column(String, nullable=False)
    output     = Column(Text)
    approved   = Column(Boolean, default=False)
    response_type = Column(String, nullable=True)  # text|visual
    image_url     = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user       = relationship("User", back_populates="tasks")
class ProcessedEmail(Base):
    __tablename__ = "processed_emails"
    id = Column(String, primary_key=True)  # Gmail message ID
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    thread_id = Column(String)
    action_taken = Column(String)  # 'drafted' or 'sent'
    processed_at = Column(DateTime, default=datetime.utcnow)


class IntegrationToken(Base):
    __tablename__ = "integration_tokens"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_provider"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False)  # e.g. "google"

    # Encrypted at rest
    access_token_enc = Column(Text, nullable=False)
    refresh_token_enc = Column(Text, nullable=True)

    token_type = Column(String, nullable=True)  # usually "Bearer"
    scope = Column(Text, nullable=True)         # space-delimited scopes
    expiry = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StructuredMemory(Base):
    __tablename__ = "structured_memories"
    __table_args__ = (
        UniqueConstraint("user_id", "category", "key", name="uq_user_category_key"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # preference|habit|task|style|other
    category = Column(String, nullable=False, index=True)

    # A stable dedupe key, e.g. "reply_style" or "weekly_update_friday"
    key = Column(String, nullable=False)

    # Human-readable memory text, e.g. "likes concise replies"
    value = Column(Text, nullable=False)

    # 0.0 - 1.0
    confidence = Column(String, nullable=True)
    source = Column(String, nullable=True)  # chat|email|calendar|manual

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OAuthState(Base):
    __tablename__ = "oauth_states"
    state          = Column(String, primary_key=True)
    user_id        = Column(String, nullable=False, index=True)
    code_verifier  = Column(String, nullable=False)
    scopes         = Column(Text, nullable=True)
    frontend_origin = Column(String, nullable=True) # To handle localhost vs 127.0.0.1
    created_at     = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────────
# Multi-Agent / A2A Protocol Models
# ─────────────────────────────────────────────────────────────────────────────

class AgentRegistry(Base):
    """Public profile for each Twin — discoverable by other agents.
    NEVER stores private memory, tokens, or calendar details.
    """
    __tablename__ = "agent_registry"

    user_id         = Column(String, ForeignKey("users.id"), primary_key=True)
    display_name    = Column(String, nullable=False)
    # Human-readable handle, e.g. "ronitshah" — used for @mention discovery
    handle          = Column(String, unique=True, nullable=True, index=True)
    # Endpoint path this agent listens on: /agent/{user_id}/receive
    agent_endpoint  = Column(String, nullable=False)
    # JSON array of capability strings: ["scheduling", "messaging"]
    capabilities    = Column(Text, default='["scheduling","messaging"]')
    # online | busy | do_not_disturb
    status          = Column(String, default="online")
    # Reserved for future message-signing feature
    public_key      = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    last_seen       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class A2AMessageLog(Base):
    """Persistent inbox + audit log for all cross-twin messages.
    Messages survive backend restarts; can be replayed for HITL review.
    """
    __tablename__ = "a2a_messages"

    msg_id           = Column(String, primary_key=True)  # UUIDv4 string
    sender_user_id   = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    receiver_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    # scheduling_request | scheduling_proposal | scheduling_confirm |
    # scheduling_reject | agent_chat | capability_query | capability_response
    msg_type         = Column(String, nullable=False)
    payload_json     = Column(Text, nullable=False)  # serialised A2AMessage.payload
    trace_json       = Column(Text, nullable=True)   # tracing metadata
    # pending | delivered | approved | rejected | expired
    status           = Column(String, default="pending")
    requires_hitl    = Column(Boolean, default=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sender   = relationship("User", foreign_keys=[sender_user_id])
    receiver = relationship("User", foreign_keys=[receiver_user_id])

