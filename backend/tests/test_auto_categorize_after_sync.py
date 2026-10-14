from __future__ import annotations

from unittest.mock import patch

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.fints.transactions import _run_auto_categorize


def test_run_auto_categorize_triggers_pipeline():
    with patch(
        "finance_server.services.auto_categorize.build_combined_predictions"
    ) as build:
        _run_auto_categorize()
    build.assert_called_once()


def test_run_auto_categorize_swallows_errors():
    with patch(
        "finance_server.services.auto_categorize.build_combined_predictions",
        side_effect=RuntimeError("boom"),
    ):
        _run_auto_categorize()  # darf nicht raisen
