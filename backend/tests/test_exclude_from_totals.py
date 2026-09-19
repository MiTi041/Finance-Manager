from finance_server.core.database import get_connection
from finance_server.db.analytics import fetch_summary
from finance_server.db.credentials import (
    load_bank_credentials,
    save_bank_credentials,
    update_bank_account,
)


def test_bank_accounts_has_exclude_from_totals_column(test_db):
    cols = {row[1] for row in test_db.execute("PRAGMA table_info(bank_accounts)")}
    assert "exclude_from_totals" in cols


def _save(iban: str):
    return save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": f"exclude-{iban}",
            "pin": "p",
            "accounts": [{"iban": iban, "account_name": "Konto"}],
        }
    )


def test_exclude_flag_survives_resync():
    scope = _save("DE_EXCLUDE_1")
    assert update_bank_account(scope, "DE_EXCLUDE_1", exclude_from_totals=True)
    assert load_bank_credentials(scope)["accounts"][0]["exclude_from_totals"] is True

    save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": "exclude-DE_EXCLUDE_1",
            "pin": "p",
            "accounts": [{"iban": "DE_EXCLUDE_1", "account_name": "Konto"}],
        },
        scope=scope,
    )
    assert load_bank_credentials(scope)["accounts"][0]["exclude_from_totals"] is True


def _insert_tx(iban: str, amount: float, hash_: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO umsaetze (account_iban, amount, date, entry_date, created_at, transaction_hash) "
            "VALUES (?, ?, '2026-07-01', '2026-07-01', '2026-07-01T10:00:00', ?)",
            (iban, amount, hash_),
        )


def test_fetch_summary_excludes_ibans():
    save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": "summary-user",
            "pin": "p",
            "accounts": [
                {"iban": "DE_SUM_A", "account_name": "A"},
                {"iban": "DE_SUM_B", "account_name": "B"},
            ],
        }
    )
    _insert_tx("DE_SUM_A", 100.0, "h-excl-a")
    _insert_tx("DE_SUM_B", 40.0, "h-excl-b")

    assert fetch_summary(days=36500)["balance"] == 140.0
    assert fetch_summary(days=36500, exclude_ibans=["DE_SUM_B"])["balance"] == 100.0
