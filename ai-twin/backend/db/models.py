from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.database import Base
from datetime import datetime
import uuid

class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email           = Column(String, unique=True, nullable=False, index=True)
    name            = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    tasks           = relationship("TaskLog", back_populates="user")

class TaskLog(Base):
    __tablename__ = "task_logs"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # nullable now
    input      = Column(Text, nullable=False)
    intent     = Column(String, nullable=False)
    output     = Column(Text)
    approved   = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user       = relationship("User", back_populates="tasks")
class ProcessedEmail(Base):
    __tablename__ = "processed_emails"
    id = Column(String, primary_key=True)  # Gmail message ID
    thread_id = Column(String)
    action_taken = Column(String)  # 'drafted' or 'sent'
    processed_at = Column(DateTime, default=datetime.utcnow)
