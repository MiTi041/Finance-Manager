from __future__ import annotations

from unittest.mock import patch

from finance_server.services import overdraw_notify


class _PostResponse:
    status_code = 200
    text = "ok"


class _FakeRequests:
    def __init__(self, sent: list):
        self._sent = sent

    def post(self, *a, **kw):
        self._sent.append(kw)
        return _PostResponse()


def _run_check(monkeypatch, balances, pending, *, sent: list, settings_db: dict) -> None:
    # settings_db is shared so sent-flags persist across calls (edge detection)
    getter = lambda key: settings_db.get(key)
    setter = lambda key, value: settings_db.__setitem__(key, value)
    deleter = lambda key: settings_db.pop(key, None)

    with (
        patch.object(overdraw_notify, "requests", _FakeRequests(sent)),
        patch.object(overdraw_notify, "get_external_key", return_value="key"),
        patch.object(overdraw_notify, "get_setting", side_effect=getter),
        patch.object(overdraw_notify, "set_setting", side_effect=setter),
        patch.object(overdraw_notify, "delete_setting", side_effect=deleter),
        patch.object(overdraw_notify, "_account_names", return_value={}),
    ):
        overdraw_notify.check_pending_overdraw("scope1", balances, pending)


def test_overdraw_email_sent_only_once_per_episode(monkeypatch):
    monkeypatch.setattr(overdraw_notify, "_notification_email", lambda: "me@example.com")

    sent = []
    settings_db: dict[str, str] = {}
    balances = [{"iban": "DE0123456789", "amount": 100.0}]
    pending = [{"account": {"iban": "DE0123456789"}, "data": {"amount": -150.0}}]

    # first overdraw -> email sent + flag stored
    _run_check(monkeypatch, balances, pending, sent=sent, settings_db=settings_db)
    assert len(sent) == 1

    # same condition again -> no duplicate
    _run_check(monkeypatch, balances, pending, sent=sent, settings_db=settings_db)
    assert len(sent) == 1

    # condition cleared with positive pending -> flag removed
    cleared = [{"account": {"iban": "DE0123456789"}, "data": {"amount": 10.0}}]
    _run_check(monkeypatch, balances, cleared, sent=sent, settings_db=settings_db)

    # a new overrun -> second email
    _run_check(monkeypatch, balances, pending, sent=sent, settings_db=settings_db)
    assert len(sent) == 2