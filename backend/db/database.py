from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

from core.config import settings

DATABASE_URL = settings.DATABASE_URL
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./ai_twin.db"

# SQLAlchemy doesn't support the 'postgres://' prefix from Railway; must be 'postgresql://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    # SQLite: thread-safe for FastAPI workers, no pool needed
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL (Railway): pool_pre_ping re-validates connections after idle timeout,
    # pool_recycle drops connections before Railway's 5-min TCP idle killer hits them.
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,         # test connection health before use
        pool_recycle=280,           # recycle before Railway's ~5min idle timeout
        pool_size=5,                # keep 5 warm connections
        max_overflow=10,            # allow up to 10 extra under burst load
        pool_timeout=30,            # wait up to 30s for a free connection
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()