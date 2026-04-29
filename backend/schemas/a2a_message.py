"""
A2A (Agent-to-Agent) Message Schema
Strict typed message envelope for all cross-twin communication.
Based on the ACP (Agent Communication Protocol) pattern.
"""

from pydantic import BaseModel, Field
from typing import Literal, Optional
import uuid
from datetime import datetime, timezone


A2A_MSG_TYPES = Literal[
    "scheduling_request",
    "scheduling_proposal",
    "scheduling_confirm",
    "scheduling_reject",
    "task_delegation",
    "task_result",
    "agent_chat",
    "capability_query",
    "capability_response",
]


class A2AMessage(BaseModel):
    """Envelope for every message exchanged between Twin agents.

    Privacy guarantee: payload MUST only contain availability booleans,
    proposed time slots, or capability flags. Private memory, emails,
    calendar event titles, and raw credentials must NEVER appear here.
    """

    msg_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique message ID (UUIDv4)",
    )
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO-8601 UTC creation timestamp",
    )
    sender_user_id: str = Field(..., description="Firebase UID of the sending Twin")
    receiver_user_id: str = Field(..., description="Firebase UID of the receiving Twin")
    msg_type: A2A_MSG_TYPES = Field(..., description="Semantic message type")
    payload: dict = Field(
        ...,
        description=(
            "Message body. For scheduling_request: {duration_minutes, lookahead_days, topic}. "
            "For scheduling_proposal: {proposed_slots: [{start, end, duration_minutes}]}. "
            "For scheduling_confirm: {slot: {start, end}, event_title}. "
            "For agent_chat: {text}."
        ),
    )
    requires_hitl: bool = Field(
        default=True,
        description="Always True for cross-agent actions — user must approve before execution",
    )
    trace: dict = Field(
        default_factory=dict,
        description="Optional tracing metadata (request chain IDs, latency, etc.)",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "sender_user_id": "abc123",
                "receiver_user_id": "xyz456",
                "msg_type": "scheduling_request",
                "payload": {
                    "duration_minutes": 30,
                    "lookahead_days": 7,
                    "topic": "Project sync",
                },
                "requires_hitl": True,
            }
        }


class SchedulingRequestPayload(BaseModel):
    """Payload for msg_type='scheduling_request'."""
    duration_minutes: int = 30
    lookahead_days: int = 7
    topic: Optional[str] = "Meeting"


class SchedulingProposalPayload(BaseModel):
    """Payload for msg_type='scheduling_proposal'."""
    proposed_slots: list[dict]   # [{start, end, duration_minutes}, ...]
    duration_minutes: int = 30
    topic: Optional[str] = "Meeting"


class SchedulingConfirmPayload(BaseModel):
    """Payload for msg_type='scheduling_confirm'."""
    slot: dict   # {start, end}
    event_title: str


class AgentChatPayload(BaseModel):
    """Payload for msg_type='agent_chat'."""
    text: str
