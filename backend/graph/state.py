from typing import TypedDict, List, Optional, Any, Union

class State(TypedDict, total=False):
    user_id: str
    user_name: str
    partner_name: str
    input: str
    chat_history: List[dict]
    intent: str
    intent_hint: Optional[str]  # explicit hint from caller to skip LLM classification
    task_plan: Union[List[str], dict]  # planner sets a dict; legacy code may pass a list
    context: str
    output: str
    approved: bool
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
    file_name: Optional[str]  # original filename for display
    # ── File generation output ───────────────────────────────────────────────
    generated_file: Optional[dict]
    # ── Visualization config (Recharts JSON) ─────────────────────────────────
    viz_config: Optional[dict]
    chart_data: Optional[dict]
    # ── Auth passthrough for internal API calls ──────────────────────────────
    access_token: Optional[str]
    # ── MCP executor output (Sprint 3) ───────────────────────────────────────
    tool_result: Optional[dict]
    execution_error: Optional[str]
    style_context: Optional[str]