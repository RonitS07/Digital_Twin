import base64
import json
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import User
from db.auth import decode_token
from security.firebase_config import verify_firebase_token
from core.config import settings

security = HTTPBearer(auto_error=False)


def _is_firebase_token(token: str) -> bool:
    """
    Quick O(1) check: Firebase tokens are RS256 JWTs and always have a 'kid'
    (Key ID) in their header. Backend-issued tokens are HS256 and never have
    a 'kid'. This avoids hammering Firebase's verification with our own JWTs.
    """
    try:
        header_b64 = token.split(".")[0]
        # JWT base64url — add padding
        padding = 4 - len(header_b64) % 4
        header_json = base64.urlsafe_b64decode(header_b64 + "=" * padding)
        header = json.loads(header_json)
        return bool(header.get("kid")) and header.get("alg", "").startswith("RS")
    except Exception:
        return False

# ─────────────────────────────────────────────────────────────────────────────
# HARDLOCKED SUPERADMIN — cannot be revoked by anyone, including other admins
# M2 FIX: Load from env var instead of hardcoding personal email in source.
# Set SUPERADMIN_EMAIL in your .env or Railway environment variables.
# ─────────────────────────────────────────────────────────────────────────────
def _get_hardlocked_admin_emails() -> set[str]:
    from core.config import settings
    emails = set()
    if settings.SUPERADMIN_EMAIL:
        emails.add(settings.SUPERADMIN_EMAIL.lower().strip())
    return emails

HARDLOCKED_ADMIN_EMAILS: set[str] = _get_hardlocked_admin_emails()


def _apply_hardlock(user: User) -> User:
    """If a user's email is in HARDLOCKED_ADMIN_EMAILS, force is_admin=True in-memory."""
    if getattr(user, "email", "") in HARDLOCKED_ADMIN_EMAILS:
        user.is_admin = True
    return user

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Standard dependency to get the currently authenticated user.
    Supports both backend-issued JWTs and Firebase ID tokens.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    
    # 1. Try decoding as backend JWT first (HS256, no 'kid' header)
    payload = decode_token(token)
    
    if payload and "sub" in payload:
        # Check for specific expiration error from db.auth.decode_token
        if payload.get("error") == "ExpiredIdTokenError":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "REFRESH_REQUIRED", "message": "Token expired"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user = db.query(User).filter(User.id == payload["sub"]).first()
        if user:
            return _apply_hardlock(user)
        # payload decoded but user not found → hard fail, don't try Firebase
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found for this token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Fallback: Try verifying as a Firebase ID Token — ONLY if the token
    #    header actually contains a 'kid' field (RS256). Backend JWTs never
    #    have 'kid', so this prevents noisy "no kid claim" warnings.
    if _is_firebase_token(token):
        fb_decoded = verify_firebase_token(token)
        if fb_decoded and "uid" in fb_decoded:
            user = db.query(User).filter(User.id == fb_decoded["uid"]).first()
            if user:
                return _apply_hardlock(user)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Dependency for routes where authentication is optional."""
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency that requires the authenticated user to have admin privileges."""
    # Hardlocked admins always pass, even if DB row hasn't been updated yet
    _apply_hardlock(current_user)
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
