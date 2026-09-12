from __future__ import annotations

from fints.formals import KTI1
from fints.models import SEPAAccount


def test_kti1_from_sepa_account_includes_full_details():
    account = SEPAAccount(
        iban="DE59760300800130350259",
        bic="CSDBDE71XXX",
        accountnumber="130350259",
        subaccount="",
        blz="76030080",
    )

    kti1 = KTI1.from_sepa_account(account)

    assert kti1.iban == "DE59760300800130350259"
    assert kti1.bic == "CSDBDE71XXX"
    assert kti1.account_number == "130350259"
    assert kti1.subaccount_number == ""
    assert kti1.bank_identifier.country_identifier == "280"
    assert kti1.bank_identifier.bank_code == "76030080"
