from db.database import SessionLocal
from db.models import TaskLog

try:
    db = SessionLocal()
    log = TaskLog(user_id="manual_test", input="test", intent="test", output="test")
    db.add(log)
    db.commit()
    print("✅ Commit successful")
except Exception as e:
    print(f"❌ Commit failed: {e}")
finally:
    db.close()
