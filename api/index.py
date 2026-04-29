import sys
import os

# Add the backend directory to the sys.path so we can import main
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from main import app
from mangum import Mangum

# Vercel requires a variable named 'handler' or 'app' for Python functions
handler = Mangum(app)
