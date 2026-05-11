import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.models import User, AgentRegistry
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))
Session = sessionmaker(bind=engine)
db = Session()

print("--- Users ---")
users = db.query(User).all()
for u in users:
    print(f"ID: {u.id}, Email: {u.email}, Name: {u.name}, Admin: {u.is_admin}")

print("\n--- Agent Registry ---")
agents = db.query(AgentRegistry).all()
for a in agents:
    print(f"User ID: {a.user_id}, Handle: {a.handle}, Status: {a.status}")

db.close()
