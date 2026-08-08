from __future__ import annotations

from unittest.mock import patch

from finance_server.services import api_keys


def _patch_conn(test_db):
    return patch("finance_server.db.settings.get_connection", return_value=test_db)


def test_get_external_key_falls_back_to_env(test_db, monkeypatch):
    from finance_server.core.config import settings as app_settings

    with _patch_conn(test_db):
        monkeypatch.setattr(app_settings, "resend_api_key", "")
        assert api_keys.get_external_key("resend_api_key") == ""
        monkeypatch.setattr(app_settings, "resend_api_key", "env-key")
        assert api_keys.get_external_key("resend_api_key") == "env-key"
        api_keys.update_external_key("resend_api_key", "db-key")
        assert api_keys.get_external_key("resend_api_key") == "db-key"


def test_update_external_key_logs_sync_op(test_db):
    with (
        _patch_conn(test_db),
        patch("finance_server.services.sync_logger.log_crud_event") as mocked,
    ):
        api_keys.update_external_key("hunter_logo_key", "  abc  ")
    mocked.assert_called_once()
    args = mocked.call_args.args
    assert args[0] == "app_settings"
    assert args[1] is None
    assert args[2] == "INSERT"
    assert args[3]["key"] == "hunter_logo_key"
    assert args[3]["value"] == "abc"


def test_update_external_key_logs_update_op(test_db):
    with (_patch_conn(test_db),):
        api_keys.update_external_key("resend_from", "x@example.de")
    with (
        _patch_conn(test_db),
        patch("finance_server.services.sync_logger.log_crud_event") as mocked,
    ):
        api_keys.update_external_key("resend_from", "y@example.de")
    assert mocked.call_args.args[2] == "UPDATE"


def test_unknown_key_rejected():
    import pytest

    with pytest.raises(ValueError):
        api_keys.get_external_key("bogus")
    with pytest.raises(ValueError):
        api_keys.update_external_key("bogus", "x")