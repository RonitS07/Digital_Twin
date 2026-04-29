from typing import TypedDict, List, Optional

class State(TypedDict, total=False):
    user_id: str
    input: str
    chat_history: List[dict]
    intent: str
    task_plan: List[str]
    context: str
    output: str
    approval_required: bool
    response_type: str
    image_url: Optional[str]