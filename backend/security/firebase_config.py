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
            # 1. Try loading from Environment Variable (JSON string) - Best for Railway
            firebase_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if firebase_json:
                import json
                cred_dict = json.loads(firebase_json)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
                logger.info("Firebase Admin SDK initialized using FIREBASE_CREDENTIALS_JSON env var")
                return

            # 2. Try loading from local file
            cert_path = settings.FIREBASE_CREDENTIALS_FILE
            if os.path.exists(cert_path):
                cred = credentials.Certificate(cert_path)
                firebase_admin.initialize_app(cred)
                logger.info(f"Firebase Admin SDK initialized using {cert_path}")
            else:
                # 3. Fallback to Application Default Credentials
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
