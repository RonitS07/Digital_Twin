from main import app
from mangum import Mangum

# Entry point for Vercel experimentalServices
handler = Mangum(app)
