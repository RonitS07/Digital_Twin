import uuid
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timezone, timedelta
from memory.chroma import store_memory, get_collection
from db.database import get_db
from main import _migrate_chroma_to_structured
from db.models import StructuredMemory, User

def test_migration():
    user_id = f"test_user_{uuid.uuid4().hex[:8]}"
    db = next(get_db())
    db_user = User(id=user_id, email=f"{user_id}@test.com", name="Test User")
    db.add(db_user)
    db.commit()
    
    old_time = datetime.now(timezone.utc) - timedelta(days=200)
    store_memory(user_id=user_id, doc_id="old_doc_1", content="Old memory content", type="chat", metadata={"timestamp": old_time.isoformat()})
    
    new_time = datetime.now(timezone.utc) - timedelta(days=10)
    store_memory(user_id=user_id, doc_id="new_doc_1", content="New memory content", type="chat", metadata={"timestamp": new_time.isoformat()})
    
    col = get_collection(user_id)
    print(f"Before migration Chroma count: {col.count()}")
    
    _migrate_chroma_to_structured(user_id, db)
    
    structured = db.query(StructuredMemory).filter(StructuredMemory.user_id == user_id).all()
    print(f"Structured memory count: {len(structured)}")
    if structured:
        print(f"Structured memory content: {structured[0].content}")
        
    print(f"After migration Chroma count: {col.count()}")
    
test_migration()
