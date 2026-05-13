import logging
import chromadb
from chromadb.utils import embedding_functions
from datetime import datetime, timezone, timedelta
from core.config import settings
GOOGLE_API_KEY = settings.GOOGLE_GENAI_API_KEY

if GOOGLE_API_KEY:
    embedder = embedding_functions.GoogleGenerativeAiEmbeddingFunction(
        api_key=GOOGLE_API_KEY,
        model_name="models/embedding-001"
    )
else:
    # Fallback to a lightweight internal embedder if no cloud key is provided
    import logging
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
    embedder = embedding_functions.DefaultEmbeddingFunction()

client = chromadb.PersistentClient(path="./chroma_store")

USE_PER_USER_COLLECTION = True 
SHARED_COLLECTION_NAME = "twin_memory"

def get_collection(user_id: str):
    name = f"user_{user_id}_memory" if USE_PER_USER_COLLECTION else SHARED_COLLECTION_NAME
    return client.get_or_create_collection(name=name, embedding_function=embedder)

def store_memory(user_id: str, doc_id: str, content: str, type: str = "chat", metadata: dict | None = None):
    col = get_collection(user_id)
    meta = {"user_id": user_id, "type": type}
    if metadata:
        meta.update(metadata)
    if "timestamp" not in meta:
        meta["timestamp"] = datetime.now(timezone.utc).isoformat()
    kwargs = dict(documents=[content], ids=[doc_id], metadatas=[meta])
    col.upsert(**kwargs)

def get_old_documents(user_id: str, older_than_days: int = 180) -> list[dict]:
    col = get_collection(user_id)
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    results = col.get(where={"user_id": user_id})
    old_docs = []
    
    docs = results.get("documents", [])
    ids = results.get("ids", [])
    metadatas = results.get("metadatas", [])
    
    if not ids:
        return old_docs
        
    for doc, doc_id, meta in zip(docs, ids, metadatas):
        timestamp_str = meta.get("timestamp")
        if not timestamp_str:
            continue
            
        try:
            doc_time = datetime.fromisoformat(timestamp_str)
            if doc_time < cutoff:
                old_docs.append({"id": doc_id, "content": doc, "metadata": meta})
        except Exception:
            pass
    return old_docs

def delete_documents_by_ids(user_id: str, ids: list[str]):
    if not ids:
        return
    col = get_collection(user_id)
    col.delete(ids=ids)
    logging.getLogger(__name__).info(f"Evicted {len(ids)} documents from ChromaDB for {user_id}")

def retrieve_memory(user_id: str, query: str, n: int = 3, type: str | None = None) -> str:
    col = get_collection(user_id)
    try:
        where = {"user_id": user_id}
        if type:
            where["type"] = type
        results = col.query(query_texts=[query], n_results=n, where=where)
        docs = results.get("documents", [[]])[0]
        return "\n".join(docs) if docs else ""
    except Exception:
        return ""