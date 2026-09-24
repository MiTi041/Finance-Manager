from __future__ import annotations

from datetime import date, timedelta

from finance_server.services.subscription_service import SubscriptionService


def _insert_monthly_debits(conn, name: str, amount: float, last_offset_days: int, count: int = 4):
    last = date.today() - timedelta(days=last_offset_days)
    for i in range(count):
        d = last - timedelta(days=30 * i)
        conn.execute(
            "INSERT INTO umsaetze "
            "(account_iban, amount, purpose, date, entry_date, applicant_name, "
            "recipient_name, transaction_hash) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "iban",
                -amount,
                "SEPA Lastschrift",
                d.isoformat(),
                d.isoformat(),
                name,
                "Zahlempfaenger",
                f"{name}-{amount}-{i}",
            ),
        )
    conn.commit()


def _insert_monthly_credits(conn, name: str, amount: float, last_offset_days: int, count: int = 4):
    _insert_monthly_debits(conn, name, -amount, last_offset_days, count)


def _insert_amounts(conn, name: str, amounts: list[float], last_offset_days: int):
    last = date.today() - timedelta(days=last_offset_days)
    for i, amount in enumerate(amounts):
        d = last - timedelta(days=30 * i)
        conn.execute(
            "INSERT INTO umsaetze "
            "(account_iban, amount, purpose, date, entry_date, applicant_name, "
            "recipient_name, transaction_hash) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "iban",
                -amount,
                "SEPA Lastschrift",
                d.isoformat(),
                d.isoformat(),
                name,
                "Zahlempfaenger",
                f"{name}-{amount}-{i}",
            ),
        )
    conn.commit()


def _flag(
    conn, counterparty_name: str, amount: float, *, dismissed: bool = False, ended: bool = False
):
    conn.execute(
        "INSERT INTO subscription_identities "
        "(counterparty_name, amount, display_name, f_zahlungspartner_id, dismissed, ended) "
        "VALUES (?, ?, NULL, NULL, ?, ?)",
        (counterparty_name, amount, 1 if dismissed else 0, 1 if ended else 0),
    )
    conn.commit()


def _seed(test_db):
    # No longer paid (ended by age), never flagged -> auto-inactive.
    _insert_monthly_debits(test_db, "Vodafone", 10.0, last_offset_days=60)
    # Actively paying but marked "Kein Abonnement" (dismissed) -> excluded everywhere.
    _insert_monthly_debits(test_db, "Netflix", 12.99, last_offset_days=30)
    _flag(test_db, "Netflix", 12.99, dismissed=True)
    # Actively paying but marked "Nicht mehr aktiv" (ended) -> hidden in list, stays in chart.
    _insert_monthly_debits(test_db, "Soundcloud", 9.99, last_offset_days=30)
    _flag(test_db, "Soundcloud", 9.99, ended=True)
    # Still running -> active.
    _insert_monthly_debits(test_db, "Spotify", 8.99, last_offset_days=30)


def _patch_connections(monkeypatch, test_db):
    monkeypatch.setattr(
        "finance_server.services.subscription_service.get_connection",
        lambda: test_db,
    )
    monkeypatch.setattr(
        "finance_server.db.transactions.get_connection",
        lambda: test_db,
    )


class TestSubscriptionServiceInactiveAndDismissed:
    def _service(self, monkeypatch, test_db):
        _seed(test_db)
        _patch_connections(monkeypatch, test_db)
        return SubscriptionService()

    def test_default_only_returns_active_not_hidden(self, monkeypatch, test_db):
        service = self._service(monkeypatch, test_db)
        subs = service.get_subscriptions()
        by_name = {s["name"]: s for s in subs}
        assert set(by_name) == {"Spotify"}
        assert by_name["Spotify"]["active"] is True

    def test_chart_set_includes_ended_and_inactive_but_not_dismissed(self, monkeypatch, test_db):
        service = self._service(monkeypatch, test_db)
        subs = service.get_subscriptions(include_inactive=True)
        by_name = {s["name"]: s for s in subs}
        assert set(by_name) == {"Spotify", "Vodafone", "Soundcloud"}
        assert by_name["Spotify"]["active"] is True
        assert by_name["Vodafone"]["active"] is False
        assert by_name["Soundcloud"]["active"] is False
        assert by_name["Soundcloud"]["ended"] is True
        assert by_name["Soundcloud"]["dismissed"] is False

    def test_include_dismissed_reveals_hidden_for_restore(self, monkeypatch, test_db):
        service = self._service(monkeypatch, test_db)
        subs = service.get_subscriptions(include_dismissed=True)
        by_name = {s["name"]: s for s in subs}
        assert set(by_name) == {"Spotify", "Netflix", "Soundcloud"}
        assert by_name["Netflix"]["dismissed"] is True
        assert by_name["Soundcloud"]["ended"] is True


class TestIncomeSubscriptions:
    def test_recurring_income_detected_with_direction(self, monkeypatch, test_db):
        _insert_monthly_credits(test_db, "Arbeitgeber", 2500.0, last_offset_days=5)
        _patch_connections(monkeypatch, test_db)
        subs = SubscriptionService().get_subscriptions()
        salary = next(s for s in subs if s["name"] == "Arbeitgeber")
        assert salary["direction"] == "income"
        assert salary["amount"] == 2500.0

    def test_income_and_expense_same_name_do_not_merge(self, monkeypatch, test_db):
        _insert_monthly_debits(test_db, "Bank", 50.0, last_offset_days=5)
        _insert_monthly_credits(test_db, "Bank", 50.0, last_offset_days=5)
        _patch_connections(monkeypatch, test_db)
        subs = [s for s in SubscriptionService().get_subscriptions() if s["name"] == "Bank"]
        assert len(subs) == 2
        assert {s["direction"] for s in subs} == {"income", "expense"}


class TestEffectiveAmountUsesNewest:
    def test_newest_transaction_not_average(self, monkeypatch, test_db):
        # newest 10.50, older three 10.00 -> average would be 10.125
        _insert_amounts(test_db, "Spotify", [10.50, 10.00, 10.00, 10.00], last_offset_days=5)
        _patch_connections(monkeypatch, test_db)
        subs = SubscriptionService().get_subscriptions()
        spotify = next(s for s in subs if s["name"] == "Spotify")
        assert spotify["effectiveAmount"] == 10.50

    def test_newest_amount_minus_its_own_refund(self, monkeypatch, test_db):
        # newest 10.50 with a 3.00 refund -> 7.50; older 10.00 charges are ignored
        _insert_amounts(test_db, "Spotify", [10.50, 10.00, 10.00, 10.00], last_offset_days=5)
        newest_id = test_db.execute(
            "SELECT id FROM umsaetze WHERE applicant_name = 'Spotify' "
            "ORDER BY entry_date DESC LIMIT 1"
        ).fetchone()["id"]
        income_id = test_db.execute(
            "INSERT INTO umsaetze (account_iban, amount, date, entry_date, transaction_hash) "
            "VALUES ('iban', 3.0, ?, ?, 'refund-income')",
            (date.today().isoformat(), date.today().isoformat()),
        ).lastrowid
        test_db.execute(
            "INSERT INTO refund_links (refund_transaction_id, expense_transaction_id, amount) "
            "VALUES (?, ?, ?)",
            (income_id, newest_id, 3.0),
        )
        test_db.commit()
        _patch_connections(monkeypatch, test_db)
        subs = SubscriptionService().get_subscriptions()
        spotify = next(s for s in subs if s["name"] == "Spotify")
        assert spotify["effectiveAmount"] == 7.50

    def test_newest_amount_minus_refund_linked_to_older_charge(self, monkeypatch, test_db):
        # newest 10.50 has no refund; the most recent refund (2.49) hangs on an older charge
        _insert_amounts(test_db, "Netflix", [10.50, 10.00, 10.00, 10.00], last_offset_days=5)
        older_id = test_db.execute(
            "SELECT id FROM umsaetze WHERE applicant_name = 'Netflix' "
            "ORDER BY entry_date DESC LIMIT 1 OFFSET 1"
        ).fetchone()["id"]
        income_id = test_db.execute(
            "INSERT INTO umsaetze (account_iban, amount, date, entry_date, transaction_hash) "
            "VALUES ('iban', 2.49, ?, ?, 'refund-income')",
            (date.today().isoformat(), date.today().isoformat()),
        ).lastrowid
        test_db.execute(
            "INSERT INTO refund_links (refund_transaction_id, expense_transaction_id, amount) "
            "VALUES (?, ?, ?)",
            (income_id, older_id, 2.49),
        )
        test_db.commit()
        _patch_connections(monkeypatch, test_db)
        subs = SubscriptionService().get_subscriptions()
        netflix = next(s for s in subs if s["name"] == "Netflix")
        assert netflix["effectiveAmount"] == 8.01
