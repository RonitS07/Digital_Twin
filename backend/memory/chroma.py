import chromadb
from chromadb.utils import embedding_functions

client = chromadb.PersistentClient(path="./chroma_store")

embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

def get_collection(user_id: str):
    return client.get_or_create_collection(
        name=f"user_{user_id}",
        embedding_function=embedder
    )

def store_memory(user_id: str, doc_id: str, text: str, metadata: dict = None):
    col = get_collection(user_id)
    kwargs = dict(documents=[text], ids=[doc_id])
    if metadata:  # only include metadatas if non-empty
        kwargs["metadatas"] = [metadata]
    col.upsert(**kwargs)

def retrieve_memory(user_id: str, query: str, n: int = 3) -> str:
    col = get_collection(user_id)
    try:
        results = col.query(query_texts=[query], n_results=n)
        docs = results.get("documents", [[]])[0]
        return "\n".join(docs) if docs else ""
    except Exception:
        return ""
 