from db.database import engine
from sqlalchemy import text

def migrate():
    try:
        with engine.connect() as conn:
            print("Connecting to database...")
            # PostgreSQL syntax: ALTER TABLE ... ADD COLUMN ...
            # SQLite syntax: ALTER TABLE ... ADD COLUMN ...
            conn.execute(text("ALTER TABLE oauth_states ADD COLUMN frontend_origin VARCHAR"))
            conn.commit()
            print("Column 'frontend_origin' added successfully to oauth_states.")
    except Exception as e:
        if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
            print("Column 'frontend_origin' already exists.")
        else:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
