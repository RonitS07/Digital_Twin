from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
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

