from langgraph.graph import StateGraph, END
from graph.state import State
from graph.nodes import classifier_node, planner_node, memory_node, responder_node

def build_graph():
    g = StateGraph(State)
    g.add_node("classifier", classifier_node)
    g.add_node("memory",     memory_node)
    g.add_node("planner",    planner_node)
    g.add_node("responder",  responder_node)
    g.set_entry_point("classifier")
    g.add_edge("classifier", "memory")
    g.add_edge("memory",     "planner")
    g.add_edge("planner",    "responder")
    g.add_edge("responder",  END)
    return g.compile()

twin_graph = build_graph()
 