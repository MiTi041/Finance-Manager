from finance_server.db.credentials import (
    _normalize_accounts,
    find_bank_account_by_iban,
    load_bank_credentials,
    save_bank_credentials,
    update_bank_account,
)


def test_bank_accounts_has_can_transfer_column(test_db):
    cols = {row[1] for row in test_db.execute("PRAGMA table_info(bank_accounts)")}
    assert "can_transfer" in cols
    assert "can_transfer_override" in cols


def test_normalize_accounts_coerces_can_transfer():
    accounts = _normalize_accounts(
        [
            {"iban": "DE1", "can_transfer": True},
            {"iban": "DE2", "can_transfer": 0.0},
            {"iban": "DE3", "can_transfer": "false"},
            {"iban": "DE4", "can_transfer": None},
        ]
    )
    assert accounts[0]["can_transfer"] is True
    assert accounts[1]["can_transfer"] is False
    assert accounts[2]["can_transfer"] is False
    assert accounts[3]["can_transfer"] is None


def test_save_and_load_persists_can_transfer():
    scope = save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": "transfer-user",
            "pin": "p",
            "accounts": [
                {"iban": "DE1", "account_name": "Giro", "can_transfer": True},
                {"iban": "DE2", "account_name": "Tagesgeld", "can_transfer": False},
            ],
        }
    )
    loaded = load_bank_credentials(scope)
    by_iban = {account["iban"]: account for account in loaded["accounts"]}
    assert by_iban["DE1"]["can_transfer"] is True
    assert by_iban["DE2"]["can_transfer"] is False


def test_resave_without_can_transfer_keeps_previous():
    scope = save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": "keep-user",
            "pin": "p",
            "accounts": [{"iban": "DE9", "account_name": "Tagesgeld", "can_transfer": False}],
        }
    )
    save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": "keep-user",
            "pin": "p",
            "accounts": [{"iban": "DE9", "account_name": "Tagesgeld"}],
        },
        scope=scope,
    )
    loaded = load_bank_credentials(scope)
    assert loaded["accounts"][0]["can_transfer"] is False


def test_public_status_falls_back_to_bank_level():
    from finance_server.services.credentials_service import CredentialsService

    status = CredentialsService()._public_status(
        {
            "bank_key": "norisbank",
            "username": "fallback-user",
            "accounts": [
                {"iban": "DE1", "can_transfer": None},
                {"iban": "DE2", "can_transfer": False},
            ],
        }
    )
    assert status["accounts"][0]["can_transfer"] is True
    assert status["accounts"][1]["can_transfer"] is False


def _save_account(iban: str, can_transfer=None):
    scope = save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": f"override-{iban}",
            "pin": "p",
            "accounts": [{"iban": iban, "account_name": "Konto", "can_transfer": can_transfer}],
        }
    )
    return scope


def test_override_wins_over_detected():
    scope = _save_account("DE_OVERRIDE_1", can_transfer=True)
    assert update_bank_account(scope, "DE_OVERRIDE_1", can_transfer_override=False)

    loaded = load_bank_credentials(scope)
    account = loaded["accounts"][0]
    assert account["can_transfer"] is False
    assert account["can_transfer_detected"] is True
    assert account["can_transfer_override"] is False


def test_override_survives_resync():
    scope = _save_account("DE_OVERRIDE_2", can_transfer=True)
    update_bank_account(scope, "DE_OVERRIDE_2", can_transfer_override=False)

    save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": "override-DE_OVERRIDE_2",
            "pin": "p",
            "accounts": [{"iban": "DE_OVERRIDE_2", "account_name": "Konto", "can_transfer": True}],
        },
        scope=scope,
    )

    account = load_bank_credentials(scope)["accounts"][0]
    assert account["can_transfer"] is False
    assert account["can_transfer_override"] is False


def test_clear_override_returns_to_detected():
    scope = _save_account("DE_OVERRIDE_3", can_transfer=True)
    update_bank_account(scope, "DE_OVERRIDE_3", can_transfer_override=False)
    update_bank_account(scope, "DE_OVERRIDE_3", can_transfer_override=None)

    account = load_bank_credentials(scope)["accounts"][0]
    assert account["can_transfer"] is True
    assert account["can_transfer_override"] is None


def test_find_bank_account_by_iban_applies_override():
    scope = _save_account("DE_OVERRIDE_4", can_transfer=True)
    update_bank_account(scope, "DE_OVERRIDE_4", can_transfer_override=False)

    found = find_bank_account_by_iban("DE_OVERRIDE_4")
    assert found is not None
    assert found["can_transfer"] is False
