import datetime
from decimal import Decimal

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.core.database import get_connection
from finance_server.db.analytics import fetch_account_balances
from finance_server.db.credentials import (
    save_bank_credentials,
    update_account_pending_balance,
)
from finance_server.fints.banks import get_bank_definition
from finance_server.fints.transactions import _is_already_booked_pending

IBAN = "DE_PENDING_1"


def _seed(booked: float, pending_amounts: list[float]) -> None:
    save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": "pending-user",
            "pin": "p",
            "accounts": [{"iban": IBAN, "account_name": "Girokonto"}],
        }
    )
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO umsaetze (account_iban, amount, date, entry_date, created_at, transaction_hash) "
            "VALUES (?, ?, '2026-09-27', '2026-09-27', '2026-09-27T10:00:00', 'booked-hash')",
            (IBAN, booked),
        )
        for idx, amount in enumerate(pending_amounts):
            conn.execute(
                "INSERT INTO vorgemerkte_umsaetze (account_iban, amount, date) "
                "VALUES (?, ?, '2026-09-27')",
                (IBAN, amount),
            )


def test_bank_pending_saldo_wins_over_list_sum(test_db):
    # Echtzeitüberweisungen (-46.67) sind in der Liste, aber bereits gebucht;
    # die Bank meldet nur -11.11 als Saldo der vorgemerkten Umsätze.
    _seed(booked=11.11, pending_amounts=[-46.67, -11.11])
    scope = "norisbank:pending-user"
    assert update_account_pending_balance(scope, IBAN, -11.11)

    balances = fetch_account_balances()
    entry = next(b for b in balances if b["account_iban"] == IBAN)
    assert entry["balance_pending"] == -11.11


def test_pending_falls_back_to_list_sum_without_bank_value(test_db):
    _seed(booked=11.11, pending_amounts=[-46.67, -11.11])

    balances = fetch_account_balances()
    entry = next(b for b in balances if b["account_iban"] == IBAN)
    assert entry["balance_pending"] == -57.78


def test_norisbank_instant_pending_is_already_booked():
    assert _is_already_booked_pending("norisbank", {"posting_text": "WERO ECHTZEITUEBERWEISUNG"})
    assert _is_already_booked_pending("norisbank", {"posting_text": "SEPA ECHTZEITUEBERWEISUNG"})
    assert not _is_already_booked_pending("norisbank", {"posting_text": "KARTENZAHLUNG"})
    assert not _is_already_booked_pending("sparkasse-lemgo", {"posting_text": "ECHTZEIT-UEBERWEISUNG"})


class _Seg:
    def __init__(self, amount: str) -> None:
        self.credit_debit = type("C", (), {"value": "C"})()
        self.amount = Decimal(amount)
        self.currency = "EUR"
        self.date = datetime.date(2026, 9, 27)

    def as_mt940_Balance(self):
        from mt940.models import Balance

        return Balance("C", str(self.amount), self.date, currency=self.currency)


class _Resp:
    balance_booked = _Seg("74.88")
    balance_pending = _Seg("74.88")


class _Response:
    def response_segments(self, command_seg, name):
        return [_Resp()]


def test_unsupported_bank_drops_pending():
    from fints.client import FinTS3PinTanClient

    assert get_bank_definition("ing-diba").supports_pending is False
    assert get_bank_definition("norisbank").supports_pending is True

    client = object.__new__(FinTS3PinTanClient)
    client._finance_supports_pending = False
    assert client._get_balance(None, _Response()).pending is None
    client._finance_supports_pending = True
    assert client._get_balance(None, _Response()).pending is not None

