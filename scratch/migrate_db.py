import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from db.database import engine, Base
from db.models import User, TaskLog, ProcessedEmail

print("Dropping existing tables...")
Base.metadata.drop_all(bind=engine)
print("Creating new tables with updated schema...")
Base.metadata.create_all(bind=engine)
print("Schema migration complete.")
