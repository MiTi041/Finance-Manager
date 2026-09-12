from __future__ import annotations

from types import SimpleNamespace

from fints.client import FinTSClientMode
from fints.dialog import FinTSDialog
from fints.formals import BankIdentifier


class FakeClient:
    mode = FinTSClientMode.INTERACTIVE
    _finance_skip_init_tan = False

    def __init__(self):
        self.bank_identifier = BankIdentifier("280", "12345678")
        self.customer_id = "12345"
        self.system_id = "SYSTEMID"
        self.bpd_version = 0
        self.upd_version = 0
        self.product_name = "Produkt"
        self.product_version = "1"
        self.init_tan_response = None

    def get_tan_mechanisms(self):
        return {"901": object()}

    def _get_tan_segment(self, orig_seg, tan_process, tan_seg=None):
        return SimpleNamespace(header=SimpleNamespace(type="HKTAN", number=2))

    def is_challenge_structured(self):
        return False


class FakeResponse:
    def __init__(self, assigned_codes):
        self.assigned_codes = assigned_codes

    def responses(self, ref):
        for code in self.assigned_codes.get(ref.header.number, []):
            yield SimpleNamespace(code=code)

    def find_segment_first(self, segment_type):
        return SimpleNamespace(challenge="SCA-Freigabe")


def _init_with_hkidn_codes(client, codes):
    dialog = FinTSDialog(client=client)

    def fake_send(*segments, **kwargs):
        return FakeResponse({segments[0].header.number: codes})

    dialog.send = fake_send
    dialog.init()


def test_init_sca_response_attached_to_hkidn_is_detected():
    client = FakeClient()
    _init_with_hkidn_codes(client, ["0030"])

    assert client.init_tan_response is not None
    assert client.init_tan_response.decoupled is False


def test_init_sca_response_on_hkidn_with_3955_is_decoupled():
    client = FakeClient()
    _init_with_hkidn_codes(client, ["0030", "3955"])

    assert client.init_tan_response is not None
    assert client.init_tan_response.decoupled is True
