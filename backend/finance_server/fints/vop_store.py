from __future__ import annotations

import base64
import secrets
import threading
import time
from typing import Any

_VOP_TTL_SECONDS = 600
_lock = threading.Lock()
_pending: dict[str, tuple[float, dict[str, Any]]] = {}


def _purge_locked() -> None:
    now = time.time()
    expired = [token for token, (expires_at, _) in _pending.items() if now >= expires_at]
    for token in expired:
        _pending.pop(token, None)


def save_pending_vop(
    blob: bytes, scope_key: str | None = None, sender_iban: str | None = None
) -> str:
    token = secrets.token_urlsafe(24)
    record = {
        "blob_b64": base64.b64encode(blob).decode("ascii"),
        "scope_key": scope_key,
        "sender_iban": sender_iban,
        "created_at": time.time(),
    }
    with _lock:
        _purge_locked()
        _pending[token] = (time.time() + _VOP_TTL_SECONDS, record)
    return token


def load_pending_vop(token: str) -> dict[str, Any] | None:
    with _lock:
        _purge_locked()
        entry = _pending.get(token)
        if entry is None:
            return None
        expires_at, record = entry
        if time.time() >= expires_at:
            _pending.pop(token, None)
            return None
        return record


def consume_pending_vop(token: str) -> dict[str, Any] | None:
    with _lock:
        _purge_locked()
        entry = _pending.pop(token, None)
        if entry is None:
            return None
        expires_at, record = entry
        if time.time() >= expires_at:
            return None
        return record


def delete_pending_vop(token: str) -> None:
    with _lock:
        _pending.pop(token, None)
