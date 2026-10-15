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


def test_unknown_key_rejected():
    import pytest

    with pytest.raises(ValueError):
        api_keys.get_external_key("bogus")
    with pytest.raises(ValueError):
        api_keys.update_external_key("bogus", "x")