import chromadb
from chromadb.utils import embedding_functions
import os

client = chromadb.PersistentClient(path="./chroma_store")

embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

USE_PER_USER_COLLECTION = os.getenv("CHROMA_PER_USER_COLLECTION", "true").lower() == "true"
SHARED_COLLECTION_NAME = os.getenv("CHROMA_SHARED_COLLECTION", "twin_memory")

def get_collection(user_id: str):
    name = f"user_{user_id}_memory" if USE_PER_USER_COLLECTION else SHARED_COLLECTION_NAME
    return client.get_or_create_collection(name=name, embedding_function=embedder)

def store_memory(user_id: str, doc_id: str, content: str, type: str = "chat", metadata: dict | None = None):
    col = get_collection(user_id)
    meta = {"user_id": user_id, "type": type}
    if metadata:
        meta.update(metadata)
    kwargs = dict(documents=[content], ids=[doc_id], metadatas=[meta])
    col.upsert(**kwargs)

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
 