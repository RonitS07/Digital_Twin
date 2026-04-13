from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import os

load_dotenv()

from graph.graph import twin_graph
from memory.chroma import store_memory

app = FastAPI(title="AI Twin API")

class ProcessRequest(BaseModel):
    input: str
    user_id: Optional[str] = "default_user"

class MemoryStoreRequest(BaseModel):
    user_id: Optional[str] = "default_user"
    doc_id: str
    text: str

class MemoryUpdateRequest(BaseModel):
    user_id: Optional[str] = "default_user"
    doc_id: str
    text: str

@app.get("/")
def root():
    return {"message": "AI Twin API running"}

@app.post("/ai/process")
def process(req: ProcessRequest):
    if not req.input.strip(): 
        return {"error": "Input missing"}
    initial_state = {
        "user_id":           req.user_id,
        "input":             req.input,
        "intent":            "",
        "task_plan":         [],
        "context":           "",
        "output":            "",
        "approval_required": False
    }
    try:
        result = twin_graph.invoke(initial_state)
        return {
            "input":             result["input"],
            "intent":            result["intent"],
            "task_plan":         result["task_plan"],
            "context_found":     bool(result["context"]),
            "output":            result["output"],
            "approval_required": result["approval_required"]
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/memory/store")
def store(req: MemoryStoreRequest):
    store_memory(user_id=req.user_id, doc_id=req.doc_id, text=req.text)
    return {"status": "stored", "doc_id": req.doc_id}

@app.delete("/memory/reset")
def reset_memory(user_id: str = "default_user"):
    from memory.chroma import client
    try:
        client.delete_collection(f"user_{user_id}")
        return {"status": "cleared", "user_id": user_id}
    except Exception as e:
        return {"error": str(e)}

@app.patch("/memory/update")
def update_memory(req: MemoryUpdateRequest):
    store_memory(user_id=req.user_id, doc_id=req.doc_id, text=req.text)
    return {"status": "updated", "doc_id": req.doc_id}