from __future__ import annotations

from types import SimpleNamespace

from fints.formals import BankIdentifier
from fints.security import PinTanAuthenticationMechanism


class FakeMessage:
    def __init__(self):
        self.segments = []
        self.dialog = SimpleNamespace(
            client=SimpleNamespace(
                system_id="SYS",
                bank_identifier=BankIdentifier("280", "12345678"),
                user_id="user",
            )
        )

    def __iadd__(self, segment):
        self.segments.append(segment)
        return self


def _build_signature(security_function: str):
    mechanism = PinTanAuthenticationMechanism("1234")
    mechanism.security_function = security_function
    message = FakeMessage()
    mechanism.sign_prepare(message)
    return mechanism.pending_signature


def test_twostep_tan_uses_security_method_version_2():
    signature = _build_signature("901")
    assert signature.security_profile.security_method_version == 2


def test_onestep_tan_uses_security_method_version_1():
    signature = _build_signature("999")
    assert signature.security_profile.security_method_version == 1
