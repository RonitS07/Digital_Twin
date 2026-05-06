from graph.graph import twin_graph

state = {
    "user_id": "me",
    "input": "who last sent me an email ?",
    "intent": "other",
    "chat_history": [],
    "output": ""
}
res = twin_graph.invoke(state)
print("INTENT:", res["intent"])
