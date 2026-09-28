from __future__ import annotations

from unittest.mock import patch

from finance_server.db.transactions import fetch_transactions


def _add_partner(conn, name: str, iban: str) -> int:
    partner_id = conn.execute(
        "INSERT INTO zahlungspartner (name) VALUES (?)", (name,)
    ).lastrowid
    conn.execute(
        "INSERT INTO ibans (iban, f_zahlungspartner_id) VALUES (?, ?)",
        (iban, partner_id),
    )
    return partner_id


def _ins(conn, *, hash_suffix: str, amount: float, **cols) -> int:
    fields = {"account_iban": "DE1", "amount": amount, "transaction_hash": f"h-{hash_suffix}"}
    fields.update(cols)
    keys = ", ".join(fields)
    placeholders = ", ".join("?" for _ in fields)
    return conn.execute(
        f"INSERT INTO umsaetze ({keys}) VALUES ({placeholders})", tuple(fields.values())
    ).lastrowid


def _search(conn, term: str) -> list[dict]:
    with patch("finance_server.db.transactions.get_connection", return_value=conn):
        return fetch_transactions(days=36500, search=term)


def test_search_matches_partner_resolved_via_iban(test_db):
    _add_partner(test_db, "Deepseek Test", "PAYPAL:UNIT-TEST-DEEPSEEK")

    literal = _ins(
        test_db,
        hash_suffix="literal",
        amount=-1.89,
        entry_date="2026-09-28",
        recipient_name="KARTE DEEPSEEK TEST",
    )
    masked = _ins(
        test_db,
        hash_suffix="masked",
        amount=-1.93,
        entry_date="2026-09-22",
        applicant_iban="PAYPAL:UNIT-TEST-DEEPSEEK",
        recipient_name="PAYPAL ....................",
    )
    _ins(
        test_db,
        hash_suffix="other",
        amount=-5.0,
        entry_date="2026-09-20",
        recipient_name="Rewe",
    )

    ids = {row["id"] for row in _search(test_db, "Deepseek")}
    assert ids == {literal, masked}


def test_search_still_matches_raw_text(test_db):
    _add_partner(test_db, "Deepseek Test", "PAYPAL:UNIT-TEST-DEEPSEEK")
    literal = _ins(
        test_db,
        hash_suffix="literal",
        amount=-1.89,
        entry_date="2026-09-28",
        recipient_name="KARTE DEEPSEEK TEST",
    )

    ids = {row["id"] for row in _search(test_db, "Deepseek")}
    assert ids == {literal}
