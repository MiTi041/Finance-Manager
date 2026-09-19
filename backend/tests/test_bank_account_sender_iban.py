from finance_server.services.credentials_service import CredentialsService
from finance_server.fints.banks import get_bank_definition
from finance_server.db.credentials import (
    _normalize_accounts,
    load_bank_credentials,
    save_bank_credentials,
    update_bank_account,
)

SCALABLE_PAYOUT = "DE86700700100922050000"


def test_bank_accounts_has_sender_iban_columns(test_db):
    cols = {row[1] for row in test_db.execute("PRAGMA table_info(bank_accounts)")}
    assert "sender_iban" in cols
    assert "bank_key" in cols


def test_scalable_is_a_manual_provider_with_payout_iban():
    scalable = get_bank_definition("scalable")
    assert scalable.sender_iban == SCALABLE_PAYOUT
    assert scalable.is_manual is True
    assert scalable.bank_logo
    assert get_bank_definition("norisbank").is_manual is False


def test_normalize_accounts_normalizes_sender_iban_and_bank_key():
    accounts = _normalize_accounts(
        [
            {
                "iban": "DE90",
                "bank_key": "Scalable",
                "sender_iban": "DE86 7007 0010 0922 0500 00",
            },
            {"iban": "DE91"},
        ]
    )
    assert accounts[0]["bank_key"] == "scalable"
    assert accounts[0]["sender_iban"] == SCALABLE_PAYOUT
    assert accounts[1]["bank_key"] is None
    assert accounts[1]["sender_iban"] is None


def test_save_and_load_persists_sender_iban():
    scope = save_bank_credentials(
        {
            "bank_key": "manual",
            "account_name": "Manuell",
            "username": "",
            "pin": "",
            "accounts": [
                {
                    "iban": "DE90",
                    "account_name": "Scalable Capital",
                    "bank_key": "scalable",
                    "sender_iban": SCALABLE_PAYOUT,
                }
            ],
        }
    )
    account = load_bank_credentials(scope)["accounts"][0]
    assert account["sender_iban"] == SCALABLE_PAYOUT
    assert account["bank_key"] == "scalable"


def test_resave_without_sender_iban_keeps_previous():
    scope = save_bank_credentials(
        {
            "bank_key": "manual",
            "account_name": "Manuell",
            "username": "",
            "pin": "",
            "accounts": [{"iban": "DE90", "sender_iban": SCALABLE_PAYOUT}],
        }
    )
    save_bank_credentials(
        {
            "bank_key": "manual",
            "account_name": "Manuell",
            "username": "",
            "pin": "",
            "accounts": [{"iban": "DE90", "account_name": "Scalable Capital"}],
        },
        scope=scope,
    )
    assert load_bank_credentials(scope)["accounts"][0]["sender_iban"] == SCALABLE_PAYOUT


def test_update_bank_account_sets_and_clears_sender_iban():
    scope = save_bank_credentials(
        {
            "bank_key": "manual",
            "account_name": "Manuell",
            "username": "",
            "pin": "",
            "accounts": [{"iban": "DE90", "sender_iban": SCALABLE_PAYOUT}],
        }
    )
    assert update_bank_account(scope, "DE90", sender_iban="DE12500105170648489890")
    assert load_bank_credentials(scope)["accounts"][0]["sender_iban"] == "DE12500105170648489890"

    assert update_bank_account(scope, "DE90", sender_iban="")
    assert load_bank_credentials(scope)["accounts"][0]["sender_iban"] is None


def test_readding_existing_iban_updates_provider_info():
    service = CredentialsService()
    service.create(
        {
            "bank_key": "manual",
            "account_name": "Manuell",
            "accounts": [{"iban": "DE90", "account_name": "Scalable Capital"}],
        }
    )
    service.create(
        {
            "bank_key": "manual",
            "account_name": "Manuell",
            "accounts": [
                {"iban": "DE90", "bank_key": "scalable", "sender_iban": SCALABLE_PAYOUT}
            ],
        }
    )
    account = next(
        item
        for item in load_bank_credentials("manual:scalable")["accounts"]
        if item["iban"] == "DE90"
    )
    assert account["bank_key"] == "scalable"
    assert account["sender_iban"] == SCALABLE_PAYOUT


def test_provider_fields_resolves_logo_and_name():
    fields = CredentialsService._provider_fields("scalable")
    assert fields["bank_name"] == "Scalable Capital"
    assert fields["bank_logo"] == "images/bank-logos/scalable-capital.png"
    assert CredentialsService._provider_fields(None) == {}


def test_manual_accounts_grouped_per_provider():
    service = CredentialsService()
    for iban, provider in (
        ("DE90", "scalable"),
        ("DE91", "scalable"),
        ("DE92", "trade-republic"),
    ):
        service.create(
            {
                "bank_key": "manual",
                "account_name": "Manuell",
                "accounts": [{"iban": iban, "bank_key": provider}],
            }
        )

    scalable = load_bank_credentials("manual:scalable")
    assert scalable["provider_key"] == "scalable"
    assert {account["iban"] for account in scalable["accounts"]} == {"DE90", "DE91"}
    # Sender-IBAN wird vom Anbieter gesetzt, nicht vom Client.
    assert all(
        account["sender_iban"] == SCALABLE_PAYOUT for account in scalable["accounts"]
    )

    trade_republic = load_bank_credentials("manual:trade-republic")
    assert [account["iban"] for account in trade_republic["accounts"]] == ["DE92"]
    assert trade_republic["accounts"][0]["sender_iban"] is None
