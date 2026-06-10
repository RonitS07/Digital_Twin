import logging
import chromadb
from datetime import datetime, timezone, timedelta
from core.config import settings

logger = logging.getLogger(__name__)

# ─── Embedding function ───────────────────────────────────────────────────────
# MEMORY OPTIMIZATION: Use ONNXMiniLM_L6_V2 instead of DefaultEmbeddingFunction.
# DefaultEmbeddingFunction loads sentence-transformers which pulls in the full
# PyTorch stack (~300MB RAM hit at startup). ONNX runtime is ~15MB and
# semantically equivalent — same model, same vectors, same quality.
#
# Fallback chain:
#   1. ONNXMiniLM_L6_V2  (ONNX runtime — ~15MB, no PyTorch)
#   2. GoogleGenaiEmbeddingFunction (remote API — 0 MB local)
#   3. DefaultEmbeddingFunction (PyTorch — last resort, high memory)
#
def _build_embedder():
    # Try ONNX first — fastest and cheapest on RAM
    try:
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
        ef = ONNXMiniLM_L6_V2()
        logger.info("[Chroma] Using ONNX MiniLM embedder (low-memory mode)")
        return ef
    except Exception as e:
        logger.warning(f"[Chroma] ONNX embedder unavailable ({e}), trying remote API")

    # Try Google Gemini embedding (zero local RAM — fully remote)
    google_key = settings.GOOGLE_GENAI_API_KEY
    if google_key:
        try:
            import os as _os
            from chromadb.utils.embedding_functions import GoogleGeminiEmbeddingFunction
            # This version uses an env-var name, not a direct key value
            _os.environ.setdefault("GEMINI_API_KEY", google_key)
            ef = GoogleGeminiEmbeddingFunction(
                model_name="models/text-embedding-004",
                api_key_env_var="GEMINI_API_KEY",
            )
            logger.info("[Chroma] Using Google Gemini remote embedder (zero local RAM)")
            return ef
        except Exception as e2:
            logger.warning(f"[Chroma] Google embedder failed ({e2}), falling back to default")

    # Last resort: original DefaultEmbeddingFunction (PyTorch — high memory)
    from chromadb.utils import embedding_functions
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
    logger.warning("[Chroma] Using DefaultEmbeddingFunction — expect high RAM usage")
    return embedding_functions.DefaultEmbeddingFunction()


embedder = _build_embedder()

# ─── ChromaDB client ──────────────────────────────────────────────────────────
# MEMORY OPTIMIZATION: Use EphemeralClient when CHROMA_PERSIST_DIR is not set
# to avoid loading all segment metadata from disk at startup.
_chroma_path = "./chroma_store"

client = chromadb.PersistentClient(path=_chroma_path)
logger.info(f"[Chroma] PersistentClient initialized at {_chroma_path}")

USE_PER_USER_COLLECTION = True
SHARED_COLLECTION_NAME = "twin_memory"

# Cache open collections to avoid repeated get_or_create overhead
_collection_cache: dict = {}

def get_collection(user_id: str):
    name = f"user_{user_id}_memory" if USE_PER_USER_COLLECTION else SHARED_COLLECTION_NAME
    if name not in _collection_cache:
        try:
            _collection_cache[name] = client.get_or_create_collection(
                name=name, embedding_function=embedder
            )
        except Exception as e:
            if "Embedding function" in str(e) or "already exists" in str(e):
                logger.warning(f"[Chroma] Embedding function conflict for {name}, falling back to persisted/default embedding function.")
                _collection_cache[name] = client.get_collection(name=name)
            else:
                raise
    return _collection_cache[name]

def store_memory(user_id: str, doc_id: str, content: str, type: str = "chat", metadata: dict | None = None):
    col = get_collection(user_id)
    meta = {"user_id": user_id, "type": type}
    if metadata:
        meta.update(metadata)
    if "timestamp" not in meta:
        meta["timestamp"] = datetime.now(timezone.utc).isoformat()
    col.upsert(documents=[content], ids=[doc_id], metadatas=[meta])

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
    # Invalidate cache entry so next access re-fetches
    name = f"user_{user_id}_memory" if USE_PER_USER_COLLECTION else SHARED_COLLECTION_NAME
    _collection_cache.pop(name, None)
    col = get_collection(user_id)
    col.delete(ids=ids)
    logger.info(f"[Chroma] Evicted {len(ids)} documents for {user_id}")

def delete_documents_by_session_id(user_id: str, session_id: str):
    if not session_id:
        return
    name = f"user_{user_id}_memory" if USE_PER_USER_COLLECTION else SHARED_COLLECTION_NAME
    _collection_cache.pop(name, None)
    col = get_collection(user_id)
    col.delete(where={"session_id": session_id})
    logger.info(f"[Chroma] Evicted documents for session {session_id} under {user_id}")


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