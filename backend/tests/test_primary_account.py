from finance_server.db.credentials import (
    load_bank_credentials,
    save_bank_credentials,
    update_bank_account,
)


def test_bank_accounts_has_is_primary_column(test_db):
    cols = {row[1] for row in test_db.execute("PRAGMA table_info(bank_accounts)")}
    assert "is_primary" in cols


def _save(ibans: list[str], username: str) -> str:
    return save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": username,
            "pin": "p",
            "accounts": [{"iban": iban, "account_name": iban} for iban in ibans],
        }
    )


def _by_iban(scope: str) -> dict[str, dict]:
    return {a["iban"]: a for a in load_bank_credentials(scope)["accounts"]}


def test_primary_flag_survives_resync():
    scope = _save(["DE_PRIMARY_1"], "primary-1")
    assert update_bank_account(scope, "DE_PRIMARY_1", is_primary=True)
    assert _by_iban(scope)["DE_PRIMARY_1"]["is_primary"] is True

    save_bank_credentials(
        {
            "bank_key": "norisbank",
            "username": "primary-1",
            "pin": "p",
            "accounts": [{"iban": "DE_PRIMARY_1", "account_name": "Konto"}],
        },
        scope=scope,
    )
    assert _by_iban(scope)["DE_PRIMARY_1"]["is_primary"] is True


def test_only_one_primary_account_globally():
    scope = _save(["DE_PRIMARY_A", "DE_PRIMARY_B"], "primary-global")

    assert update_bank_account(scope, "DE_PRIMARY_A", is_primary=True)
    assert update_bank_account(scope, "DE_PRIMARY_B", is_primary=True)

    accounts = _by_iban(scope)
    assert accounts["DE_PRIMARY_A"]["is_primary"] is False
    assert accounts["DE_PRIMARY_B"]["is_primary"] is True


def test_unset_primary_flag():
    scope = _save(["DE_PRIMARY_C"], "primary-unset")
    assert update_bank_account(scope, "DE_PRIMARY_C", is_primary=True)
    assert update_bank_account(scope, "DE_PRIMARY_C", is_primary=False)
    assert _by_iban(scope)["DE_PRIMARY_C"]["is_primary"] is False
