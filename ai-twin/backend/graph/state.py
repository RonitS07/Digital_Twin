from typing import TypedDict, List, Optional

class State(TypedDict, total=False):
    user_id: str
    user_name: str
    input: str
    chat_history: List[dict]
    intent: str
    task_plan: List[str]
    context: str
    output: str
    approval_required: bool
    response_type: str
    image_url: Optional[str]
    # ── Multi-agent / A2A fields ─────────────────────────────────────────────
    # Incoming A2A message dict (set when a Twin receives a cross-agent msg)
    a2a_msg: Optional[dict]
    # @handle of the target Twin extracted from user intent (e.g. "schedule with @bob")
    target_user_handle: Optional[str]
    # gmail_sync / calendar_sync preference flags
    gmail_sync: bool
    calendar_sync: bool
    slack_sync: bool