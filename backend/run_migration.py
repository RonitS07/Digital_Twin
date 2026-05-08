from db.database import engine
from db.models import Base
import sqlalchemy

Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    try:
        conn.execute(sqlalchemy.text("ALTER TABLE structured_memories ADD COLUMN memory_type VARCHAR DEFAULT 'general';"))
    except Exception as e:
        print("memory_type:", e)
    
    try:
        conn.execute(sqlalchemy.text("ALTER TABLE structured_memories ADD COLUMN content TEXT;"))
    except Exception as e:
        print("content:", e)
    conn.commit()
print("Migration done")
