import os
import sys
from datetime import datetime, timezone

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from db.database import get_db
from db.models import User


def make_admin(email: str) -> None:
    db = next(get_db())
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"User {email} not found. They must log in once first.")
            return
        user.is_admin = True
        user.admin_granted_at = datetime.now(timezone.utc)
        user.admin_granted_by = "bootstrap"
        db.commit()
        print(f"Admin granted to {email}")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/make_admin.py <email>")
        raise SystemExit(1)
    make_admin(sys.argv[1])
