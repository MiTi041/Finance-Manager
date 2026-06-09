from __future__ import annotations

from datetime import datetime, timezone

from finance_server.core.database import get_connection


def get_setting(key: str) -> str | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT value FROM app_settings WHERE key = ?", (key,)
        ).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (key, value, now),
        )


def delete_setting(key: str) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM app_settings WHERE key = ?", (key,)
        )
        return cursor.rowcount > 0
