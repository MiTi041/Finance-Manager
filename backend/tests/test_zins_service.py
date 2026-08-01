from __future__ import annotations

from datetime import date

from finance_server.services.zins_service import berechne_endguthaben


def test_mixed_payout_days_deposit_once_at_later_date():
    endguthaben, einzahlungen = berechne_endguthaben(
        0.0, 100.0, [], date(2026, 8, 1), date(2026, 8, 31), payout_days=[15, -1]
    )
    assert einzahlungen == 100.0
    assert endguthaben == 100.0


def test_multiple_fixed_days_deposit_once_at_later_date():
    endguthaben, einzahlungen = berechne_endguthaben(
        0.0, 100.0, [], date(2026, 8, 1), date(2026, 8, 31), payout_days=[15, 20]
    )
    assert einzahlungen == 100.0
    assert endguthaben == 100.0
