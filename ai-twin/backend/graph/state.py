from typing import TypedDict, List

class State(TypedDict):
    user_id: str
    input: str
    intent: str
    task_plan: List[str]
    context: str
    output: str
    approval_required: bool
 