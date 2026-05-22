from langgraph.graph import StateGraph, END
from graph.state import State
from graph.nodes import classifier_node, planner_node, memory_node, responder_node, executor_node

# Intents that require the full pipeline: memory retrieval + planning + execution
_TOOL_INTENTS = {
    "email_read", "email_draft", "email_send",
    "calendar", "calendar_create", "calendar_freebusy",
    "slack_send", "slack_read", "slack_channels",
    "telegram_send", "telegram_read",
    "whatsapp_send", "whatsapp_read",
    "visual", "file_read", "file_generate",
    "visualize", "scheduling", "briefing",
    "schedule_with_user", "schedule_with_twin", "twin_message",
}

def _route_after_classifier(state: State) -> str:
    """
    Fast-path routing: skip memory + planner for conversational messages.
    - Tool intents  -> memory -> planner -> executor -> responder (full pipeline)
    - General/Q&A   -> responder directly (saves ~2 serial LLM calls + RAG I/O)
    """
    intent = state.get("intent", "general")
    if intent in _TOOL_INTENTS:
        return "memory"
    # For general / question / casual / unrecognised intents
    return "responder"

def build_graph():
    g = StateGraph(State)
    g.add_node("classifier", classifier_node)
    g.add_node("memory",     memory_node)
    g.add_node("planner",    planner_node)
    g.add_node("executor",   executor_node)
    g.add_node("responder",  responder_node)

    g.set_entry_point("classifier")

    # Conditional edge after classifier: fast-path or full tool pipeline
    g.add_conditional_edges(
        "classifier",
        _route_after_classifier,
        {
            "memory":    "memory",
            "responder": "responder",
        }
    )

    # Full tool pipeline edges
    g.add_edge("memory",    "planner")
    g.add_edge("planner",   "executor")
    g.add_edge("executor",  "responder")
    g.add_edge("responder", END)
    return g.compile()

twin_graph = build_graph()