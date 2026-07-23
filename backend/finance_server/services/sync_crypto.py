from __future__ import annotations

import hashlib
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


PBKDF2_SALT = b"finance-sync-v1"
PBKDF2_ITERATIONS = 600_000


def derive_key(password: str) -> tuple[bytes, str]:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=PBKDF2_SALT,
        iterations=PBKDF2_ITERATIONS,
    )
    key = kdf.derive(password.encode("utf-8"))
    key_id = hashlib.sha256(key).hexdigest()[:16]
    return key, key_id


def encrypt_batch(ops: list[dict], key: bytes) -> bytes:
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    plaintext = json.dumps(ops, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def decrypt_batch(payload: bytes, key: bytes) -> list[dict]:
    nonce, ciphertext = payload[:12], payload[12:]
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))
