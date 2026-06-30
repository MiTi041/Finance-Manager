from __future__ import annotations

import json
from typing import Any
import sqlite3

from finance_server.core.database import get_connection


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "umsatz_id": row["umsatz_id"],
        "image_filename": row["image_filename"],
        "image_path": row["image_path"],
        "extracted_data": json.loads(row["extracted_data"]) if row["extracted_data"] else None,
        "store_name": row["store_name"],
        "total_amount": row["total_amount"],
        "receipt_date": row["receipt_date"],
        "confidence": row["confidence"],
        "created_at": row["created_at"],
    }


def insert_receipt(receipt: dict[str, Any]) -> int:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO belege (umsatz_id, image_filename, image_path, extracted_data, store_name, total_amount, receipt_date, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                receipt["umsatz_id"],
                receipt["image_filename"],
                receipt["image_path"],
                json.dumps(receipt.get("extracted_data"), ensure_ascii=False) if receipt.get("extracted_data") else None,
                receipt.get("store_name"),
                receipt.get("total_amount"),
                receipt.get("receipt_date"),
                receipt.get("confidence"),
            ),
        )
        return cursor.lastrowid


def fetch_receipts_for_transaction(umsatz_id: int) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM belege WHERE umsatz_id = ? ORDER BY created_at DESC",
            (umsatz_id,),
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def fetch_receipt(receipt_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM belege WHERE id = ?",
            (receipt_id,),
        ).fetchone()
    return row_to_dict(row) if row else None


def delete_receipt(receipt_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM belege WHERE id = ?", (receipt_id,))
        return cursor.rowcount > 0


def delete_receipts_for_transaction(umsatz_id: int) -> int:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM belege WHERE umsatz_id = ?", (umsatz_id,))
        return cursor.rowcount
