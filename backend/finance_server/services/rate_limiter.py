from __future__ import annotations

import time
import threading
from typing import Any

from finance_server.core.config import settings


_RATE_LIMITS: dict[str, int] = {
    "fetch_accounts": settings.fints_rate_limit_fetch_accounts,
    "fetch_transactions": settings.fints_rate_limit_fetch_transactions,
    "fetch_balance": settings.fints_rate_limit_fetch_balance,
    "sync_all": settings.fints_rate_limit_sync_all,
}

_last_requests: dict[str, float] = {}
_lock = threading.Lock()


def _key(operation: str, scope: str | None = None) -> str:
    if operation == "sync_all":
        return "sync_all"
    return f"{operation}:{scope or 'default'}"


def check_rate_limit(operation: str, scope: str | None = None) -> dict[str, Any]:
    cooldown = _RATE_LIMITS.get(operation)
    if cooldown is None or cooldown <= 0:
        return {"allowed": True}

    key = _key(operation, scope)
    now = time.time()

    with _lock:
        last = _last_requests.get(key)
        if last is not None:
            elapsed = now - last
            if elapsed < cooldown:
                retry_after = int(cooldown - elapsed) + 1
                return {
                    "allowed": False,
                    "retry_after": retry_after,
                    "operation": operation,
                    "scope": scope,
                }
        _last_requests[key] = now

    return {"allowed": True}


class RateLimitExceeded(Exception):
    def __init__(self, operation: str, retry_after: int, scope: str | None = None):
        self.operation = operation
        self.retry_after = retry_after
        self.scope = scope
        super().__init__(f"Rate limit exceeded for {operation}. Retry after {retry_after}s")


def enforce_rate_limit(operation: str, scope: str | None = None) -> None:
    result = check_rate_limit(operation, scope)
    if not result["allowed"]:
        raise RateLimitExceeded(
            operation=result["operation"],
            retry_after=result["retry_after"],
            scope=result["scope"],
        )
