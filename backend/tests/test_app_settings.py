from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from finance_server.api import app_settings


def _patch_conn(test_db):
    return patch("finance_server.db.settings.get_connection", return_value=test_db)


def test_default_false(test_db):
    with _patch_conn(test_db):
        assert app_settings.get_app_settings() == {"hide_pending_transactions": False}


def test_persist(test_db):
    with _patch_conn(test_db):
        result = app_settings.update_app_settings({"hide_pending_transactions": True})
        assert result == {"hide_pending_transactions": True}
        assert app_settings.get_app_settings() == {"hide_pending_transactions": True}


def test_unknown_key_rejected(test_db):
    with _patch_conn(test_db):
        with pytest.raises(HTTPException):
            app_settings.update_app_settings({"bogus": True})
