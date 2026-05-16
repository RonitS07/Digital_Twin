import sys
import os
from datetime import datetime, timezone

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import get_db
from db.models import User

def make_admin(email):
    db = next(get_db())
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"User with email {email} not found.")
            return
        
        user.is_admin = True
        user.admin_granted_at = datetime.now(timezone.utc)
        user.admin_granted_by = "system_script"
        db.commit()
        print(f"Successfully elevated {email} to Admin.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/make_admin.py <email>")
    else:
        make_admin(sys.argv[1])
