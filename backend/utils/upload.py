import os
import uuid
import mimetypes
import werkzeug.utils
from fastapi import HTTPException, status
from core.config import settings

def validate_and_save_upload(file_bytes: bytes, original_filename: str) -> str:
    """
    Validates file MIME type, extension, and size, then saves it securely.
    Returns the relative path to the saved file.
    """
    # 1. Size Validation
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB"
        )

    # 2. Path Traversal & Extension Validation
    safe_filename = werkzeug.utils.secure_filename(original_filename)
    if not safe_filename:
        # Fallback if secure_filename returns empty (e.g. only special characters)
        safe_filename = "upload_" + uuid.uuid4().hex[:8]
        
    _, ext = os.path.splitext(safe_filename)
    if ext.lower() not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Extension {ext} not allowed."
        )

    # 3. MIME Type Validation
    # Use mimetypes (standard library) instead of libmagic to avoid system dependency issues
    mime, _ = mimetypes.guess_type(safe_filename)
    
    # Basic deep check for safety (binary headers)
    is_pdf = file_bytes.startswith(b'%PDF-')
    is_png = file_bytes.startswith(b'\x89PNG\r\n\x1a\n')
    is_jpg = file_bytes.startswith(b'\xff\xd8\xff')
    
    if not mime:
        # Fallback for common types if guess_type fails
        if is_pdf: mime = "application/pdf"
        elif is_png: mime = "image/png"
        elif is_jpg: mime = "image/jpeg"
        else: mime = "application/octet-stream"

    if not (mime.startswith("image/") or mime in ["application/pdf", "text/plain"]):
        # Extra check: if it looks like a PDF but mime failed, allow it
        if not (is_pdf or is_png or is_jpg):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"MIME type {mime} not allowed."
            )


    # 4. Final Path Construction
    # Using UUID prefix to prevent collisions and overwrite attacks
    final_filename = f"{uuid.uuid4()}_{safe_filename}"
    
    # Ensure uploads directory exists
    uploads_dir = os.path.join(os.getcwd(), "uploads")
    if not os.path.exists(uploads_dir):
        os.makedirs(uploads_dir)
        
    save_path = os.path.join(uploads_dir, final_filename)
    
    # Canonical Path Validation (Absolute check)
    if not os.path.abspath(save_path).startswith(os.path.abspath(uploads_dir)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path."
        )

    with open(save_path, "wb") as buffer:
        buffer.write(file_bytes)
        
    return os.path.join("uploads", final_filename)
