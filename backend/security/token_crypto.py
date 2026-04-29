import os
from cryptography.fernet import Fernet, InvalidToken


def _get_fernet() -> Fernet:
    key = os.getenv("TOKEN_ENC_KEY")
    if not key:
        raise RuntimeError("TOKEN_ENC_KEY is not set (must be a Fernet key)")
    try:
        return Fernet(key.encode("utf-8"))
    except Exception as e:
        raise RuntimeError("TOKEN_ENC_KEY is invalid") from e


def encrypt_str(value: str) -> str:
    if value is None:
        return None
    f = _get_fernet()
    return f.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_str(value_enc: str) -> str:
    if value_enc is None:
        return None
    f = _get_fernet()
    try:
        return f.decrypt(value_enc.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise RuntimeError("Token decryption failed (wrong TOKEN_ENC_KEY?)") from e

