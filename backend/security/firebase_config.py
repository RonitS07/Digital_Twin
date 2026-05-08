import os
import logging
from typing import Optional

import firebase_admin
from firebase_admin import credentials, auth

from core.config import settings

logger = logging.getLogger(__name__)

def initialize_firebase():
    """Initialize the Firebase Admin SDK."""
    if not firebase_admin._apps:
        try:
            # Look for the path in the settings
            cert_path = settings.FIREBASE_CREDENTIALS_FILE
            if os.path.exists(cert_path):
                cred = credentials.Certificate(cert_path)
                firebase_admin.initialize_app(cred)
                logger.info(f"Firebase Admin SDK initialized using {cert_path}")
            else:
                firebase_admin.initialize_app()
                logger.info("Firebase Admin SDK initialized using Application Default Credentials")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Admin SDK: {e}")

def verify_firebase_token(id_token: str) -> Optional[dict]:
    """Verify the Firebase ID token and return the decoded payload."""
    try:
        # check_revoked=True adds security against revoked sessions
        decoded_token = auth.verify_id_token(id_token, check_revoked=True)
        return decoded_token
    except auth.RevokedIdTokenError:
        logger.warning("Revoked Firebase ID token used.")
        return None
    except auth.ExpiredIdTokenError:
        logger.warning("Expired Firebase ID token used.")
        return None
    except Exception as e:
        logger.warning(f"Invalid Firebase ID token: {e}")
        return None
