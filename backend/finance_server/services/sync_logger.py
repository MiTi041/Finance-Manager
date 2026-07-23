from __future__ import annotations

from typing import Any


def log_crud_event(
    table_name: str,
    row_id: int | None,
    op_type: str,
    data: dict[str, Any] | None = None,
) -> None:
    from finance_server.db.sync import log_sync_op

    log_sync_op(table_name, row_id, op_type, data)
