from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection


def list_buckets() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM allocation_buckets ORDER BY sort_order"
        ).fetchall()
    return [dict(r) for r in rows]


def get_bucket(bucket_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM allocation_buckets WHERE id = ?", (bucket_id,)
        ).fetchone()
    return dict(row) if row else None


def update_bucket(bucket_id: int, payload: dict[str, Any], set_null: list[str] | None = None) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    # Include False values (is_active), only exclude None
    fields = {k: v for k, v in payload.items() if v is not None}
    for k in (set_null or []):
        fields[k] = None
    if not fields:
        return get_bucket(bucket_id)
    fields["updated_at"] = now
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [bucket_id]
    with get_connection() as connection:
        connection.execute(
            f"UPDATE allocation_buckets SET {set_clause} WHERE id = ?",
            values,
        )
    result = get_bucket(bucket_id)
    if result:
        from finance_server.services.sync_logger import log_crud_event
        log_crud_event("allocation_buckets", bucket_id, "UPDATE", result)
    return result


def get_bafoeg_config() -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM allocation_bafoeg_config LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def upsert_bafoeg_config(payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM allocation_bafoeg_config LIMIT 1"
        ).fetchone()
        if existing:
            payload["updated_at"] = now
            set_clause = ", ".join(f"{k} = ?" for k in payload)
            values = list(payload.values()) + [existing["id"]]
            connection.execute(
                f"UPDATE allocation_bafoeg_config SET {set_clause} WHERE id = ?",
                values,
            )
        else:
            payload["created_at"] = now
            payload["updated_at"] = now
            keys = ", ".join(payload)
            placeholders = ", ".join("?" for _ in payload)
            connection.execute(
                f"INSERT INTO allocation_bafoeg_config ({keys}) VALUES ({placeholders})",
                list(payload.values()),
            )
    result = get_bafoeg_config()
    if result:
        from finance_server.services.sync_logger import log_crud_event
        op = "INSERT" if not existing else "UPDATE"
        log_crud_event("allocation_bafoeg_config", result["id"], op, result)
    return result


def create_run(month: str, net_income: float, total_allocated: float) -> int:
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO allocation_runs (month, net_income, total_allocated) VALUES (?, ?, ?)",
            (month, net_income, total_allocated),
        )
        return cursor.lastrowid


def get_run_for_month(month: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM allocation_runs WHERE month = ? ORDER BY created_at DESC LIMIT 1",
            (month,),
        ).fetchone()
    return dict(row) if row else None


def create_run_bucket(run_id: int, bucket_id: int, target_amount: float) -> int:
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO allocation_run_buckets (run_id, bucket_id, target_amount) VALUES (?, ?, ?)",
            (run_id, bucket_id, target_amount),
        )
        return cursor.lastrowid


def get_run_buckets(run_id: int) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """SELECT arb.*, ab.bucket_type, ab.percentage
               FROM allocation_run_buckets arb
               JOIN allocation_buckets ab ON ab.id = arb.bucket_id
               WHERE arb.run_id = ?
               ORDER BY ab.sort_order""",
            (run_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_run_bucket_transferred(run_bucket_id: int, amount: float) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with get_connection() as connection:
        connection.execute(
            """UPDATE allocation_run_buckets
               SET transferred = ?, transferred_at = ?, is_completed = 1
               WHERE id = ?""",
            (amount, now, run_bucket_id),
        )


def update_run_bucket_transferred(run_bucket_id: int, state: dict[str, Any]) -> None:
    with get_connection() as connection:
        connection.execute(
            """UPDATE allocation_run_buckets
               SET transferred = ?, transferred_at = ?, is_completed = ?
               WHERE id = ?""",
            (
                state.get("transferred", 0),
                state.get("transferred_at"),
                1 if state.get("is_completed") else 0,
                run_bucket_id,
            ),
        )


def list_runs() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM allocation_runs ORDER BY month DESC LIMIT 12"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_run(month: str) -> None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id FROM allocation_runs WHERE month = ? ORDER BY created_at DESC LIMIT 1",
            (month,),
        ).fetchone()
        if row:
            connection.execute("DELETE FROM allocation_run_buckets WHERE run_id = ?", (row["id"],))
            connection.execute("DELETE FROM allocation_runs WHERE id = ?", (row["id"],))


def set_bucket_active_by_type(bucket_type: str, is_active: bool) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with get_connection() as connection:
        connection.execute(
            "UPDATE allocation_buckets SET is_active = ?, updated_at = ? WHERE bucket_type = ?",
            (1 if is_active else 0, now, bucket_type),
        )
        row = connection.execute(
            "SELECT * FROM allocation_buckets WHERE bucket_type = ?", (bucket_type,)
        ).fetchone()
    if row:
        from finance_server.services.sync_logger import log_crud_event
        log_crud_event("allocation_buckets", row["id"], "UPDATE", dict(row))


def get_active_buckets_sum_percentage() -> float:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT COALESCE(SUM(percentage), 0) FROM allocation_buckets WHERE is_active = 1 AND bucket_type != 'spending'"
        ).fetchone()
    return row[0]
