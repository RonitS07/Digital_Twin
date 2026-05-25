"""
H8 FIX: Transactional Outbox Model for PostgreSQL + ChromaDB
============================================================
Guarantees that every ChromaDB write is tracked in PostgreSQL.
If a ChromaDB write fails, the record stays in "pending"/"failed"
status and can be retried by the 02:00 IST sweep cron.

Schema:
  - id          : auto-increment primary key
  - user_id     : owner of the memory record
  - payload     : JSON blob (content, doc_id, type, metadata)
  - status      : "pending" → "done" | "failed"
  - created_at  : UTC timestamp
  - attempts    : how many times the ChromaDB write has been tried
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, JSON, DateTime
from db.database import Base


class MemoryOutbox(Base):
    __tablename__ = "memory_outbox"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    payload = Column(JSON, nullable=False)          # { doc_id, content, type, metadata }
    status = Column(String, default="pending")      # "pending" | "done" | "failed"
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    attempts = Column(Integer, default=0)
