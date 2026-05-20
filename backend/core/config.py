import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    # App Settings
    PROJECT_NAME: str = "AI Twin API"
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:8000",
        "https://digital-twin-ten-sand.vercel.app",
        "https://digital-twin-ten-sand-git-main-ronits07s-projects.vercel.app",
        "https://digital-twin-ten-sand.vercel.app"
    ]
    FRONTEND_URL: str = "http://127.0.0.1:5173"
    BACKEND_URL: Optional[str] = None
    NGROK_URL: Optional[str] = None
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "DEVELOPMENT_SECRET_KEY_CHANGE_ME")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    
    # Firebase
    FIREBASE_CREDENTIALS_FILE: str = "firebase-credentials.json"
    GOOGLE_CREDENTIALS_FILE: str = "credentials.json"
    
    # External APIs
    GOOGLE_GENAI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    
    # Database
    DATABASE_URL: str = "sqlite:///./ai_twin.db"
    
    # Uploads
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024 # 5MB
    ALLOWED_UPLOAD_EXTENSIONS: List[str] = [".jpg", ".jpeg", ".png", ".pdf", ".txt"]
    UPLOAD_DIR: str = "/srv/digital_twin_uploads"
    
    # Advanced
    LEARNING_MODEL: str = "llama-3.1-8b-instant"
    CHROMA_PER_USER_COLLECTION: bool = True

    # Additional Env Vars (from logs)
    HUGGINGFACE_API_KEY: Optional[str] = None
    TOKEN_ENC_KEY: Optional[str] = None
    HF_TOKEN: Optional[str] = None
    GOOGLE_OAUTH_REDIRECT_URI: Optional[str] = None
    SLACK_CLIENT_ID: Optional[str] = None
    SLACK_CLIENT_SECRET: Optional[str] = None
    SLACK_OAUTH_REDIRECT_URI: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

settings = Settings()
