from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import finance_server.services  # noqa: F401  breaks fints circular import
from finance_server.fints.client import (
    _bootstrap_with_forced_tan_mechanism,
    _capture_tan_medium_from_challenge,
    _forced_tan_mechanism,
    _forced_tan_medium,
)


class FakeTanClient:
    def __init__(self, mechanisms, media_required=True):
        self._mechanisms = mechanisms
        self._media_required = media_required
        self.selected_tan_medium = None
        self.selected_security_function = None
        self.fetched = False
        self.set_calls = []

    def get_tan_mechanisms(self):
        return dict(self._mechanisms)

    def fetch_tan_mechanisms(self):
        self.fetched = True

    def set_tan_mechanism(self, mechanism):
        self.set_calls.append(mechanism)
        self.selected_security_function = mechanism

    def is_tan_media_required(self):
        return self._media_required


def test_forced_mechanism_uses_empty_medium_when_media_required():
    client = FakeTanClient({"920": object(), "921": object()})
    _bootstrap_with_forced_tan_mechanism(client, "921")
    assert client.set_calls == ["921"]
    assert client.selected_tan_medium == ""
    assert not client.fetched


def test_forced_mechanism_uses_given_medium_name():
    client = FakeTanClient({"920": object(), "921": object()})
    _bootstrap_with_forced_tan_mechanism(client, "921", medium="Michis IPhone")
    assert client.set_calls == ["921"]
    assert client.selected_tan_medium == "Michis IPhone"
    assert not client.fetched


def test_forced_mechanism_fetches_when_mechanisms_unknown():
    client = FakeTanClient({}, media_required=False)

    def _fetch():
        client.fetched = True
        client._mechanisms["921"] = object()

    client.fetch_tan_mechanisms = _fetch
    _bootstrap_with_forced_tan_mechanism(client, "921")
    assert client.fetched
    assert client.set_calls == ["921"]
    assert client.selected_tan_medium is None


def test_forced_mechanism_falls_back_to_cli_bootstrap_when_not_offered():
    client = FakeTanClient({"920": object()})
    with patch(
        "finance_server.fints.client.minimal_interactive_cli_bootstrap"
    ) as mock_bootstrap:
        _bootstrap_with_forced_tan_mechanism(client, "921")
    mock_bootstrap.assert_called_once_with(client)
    assert client.set_calls == []
    assert client.selected_tan_medium is None


def test_forced_mechanism_ignored_when_media_not_required():
    client = FakeTanClient({"921": object()}, media_required=False)
    _bootstrap_with_forced_tan_mechanism(client, "921")
    assert client.set_calls == ["921"]
    assert client.selected_tan_medium is None


def test_forced_mechanism_keeps_medium_when_already_selected():
    client = FakeTanClient({"921": object()})
    client.selected_tan_medium = "Mein iPhone"
    _bootstrap_with_forced_tan_mechanism(client, "921")
    assert client.selected_tan_medium == "Mein iPhone"


def test_forced_mechanism_overrides_stale_empty_medium():
    client = FakeTanClient({"921": object()})
    client.selected_tan_medium = ""
    _bootstrap_with_forced_tan_mechanism(client, "921", medium="Michis IPhone")
    assert client.selected_tan_medium == "Michis IPhone"


def test_forced_tan_mechanism_marker_only_for_real_clients():
    class Marker:
        _finance_force_tan_mechanism = "921"
        _finance_force_tan_medium = "Michis IPhone"

    class NoMarker:
        pass

    assert _forced_tan_mechanism(Marker()) == "921"
    assert _forced_tan_mechanism(NoMarker()) is None
    assert _forced_tan_mechanism(object()) is None
    assert _forced_tan_medium(Marker()) == "Michis IPhone"
    assert _forced_tan_medium(NoMarker()) is None
    assert _forced_tan_medium(object()) is None


def test_capture_tan_medium_from_init_challenge():
    client = SimpleNamespace(
        selected_tan_medium=None,
        init_tan_response=SimpleNamespace(
            tan_request=SimpleNamespace(tan_medium_name="Mein iPhone")
        ),
    )
    _capture_tan_medium_from_challenge(client)
    assert client.selected_tan_medium == "Mein iPhone"


def test_capture_tan_medium_from_operation_response():
    client = SimpleNamespace(selected_tan_medium=None, init_tan_response=None)
    response = SimpleNamespace(tan_request=SimpleNamespace(tan_medium_name="Mein iPhone"))
    _capture_tan_medium_from_challenge(client, response)
    assert client.selected_tan_medium == "Mein iPhone"


def test_capture_tan_medium_keeps_existing_medium():
    client = SimpleNamespace(
        selected_tan_medium="Bestehendes Gerät",
        init_tan_response=SimpleNamespace(
            tan_request=SimpleNamespace(tan_medium_name="Mein iPhone")
        ),
    )
    _capture_tan_medium_from_challenge(client)
    assert client.selected_tan_medium == "Bestehendes Gerät"


def test_capture_tan_medium_ignores_missing_name():
    client = SimpleNamespace(selected_tan_medium=None, init_tan_response=None)
    response = SimpleNamespace(tan_request=SimpleNamespace(tan_medium_name=None))
    _capture_tan_medium_from_challenge(client, response)
    assert client.selected_tan_medium is None
