from typing import TypedDict, List, Optional, Any

class State(TypedDict, total=False):
    user_id: str
    user_name: str
    partner_name: str
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
    a2a_msg: Optional[dict]
    target_user_handle: Optional[str]
    # gmail_sync / calendar_sync preference flags
    gmail_sync: bool
    calendar_sync: bool
    slack_sync: bool
    # ── File & Vision fields ─────────────────────────────────────────────────
    files: List[dict]
    file_path: Optional[str]
    # ── File generation output ───────────────────────────────────────────────
    generated_file: Optional[dict]
    # ── Visualization config (Recharts JSON) ─────────────────────────────────
    viz_config: Optional[dict]
    # ── Auth passthrough for internal API calls ──────────────────────────────
    access_token: Optional[str]