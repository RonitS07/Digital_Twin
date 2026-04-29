
import os
import shutil
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.database import DATABASE_URL
from db.models import Base

def reset_all():
    print("🚀 Starting full reset...")

    # 1. Clear Database Tables
    try:
        engine = create_engine(DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = SessionLocal()
        
        # We use metadata to drop all and recreate, or strictly truncate
        print("Emptying PostgreSQL tables...")
        # Order matters for foreign keys: TaskLog and IntegrationToken depend on User
        # Recreating tables is cleaner
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        
        db.close()
        print("✅ PostgreSQL reset complete.")
    except Exception as e:
        print(f"❌ Error resetting Postgres: {e}")

    # 2. Clear ChromaDB Memory
    chroma_path = "./chroma_store"
    if os.path.exists(chroma_path):
        try:
            shutil.rmtree(chroma_path)
            print(f"✅ ChromaDB store at {chroma_path} deleted.")
        except Exception as e:
            print(f"❌ Error deleting ChromaDB store: {e}")
    else:
        print("ℹ️ ChromaDB store not found, skipping.")

    print("\n✨ Reset complete! The system is now brand new.")
    print("📝 Note: Please refresh your browser or clear Local Storage if chat bubbles persist in the UI.")

if __name__ == "__main__":
    reset_all()
