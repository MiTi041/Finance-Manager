import datetime
import logging
from typing import Any

from fints.client import NeedTANResponse

from finance_server.models.bank import BankCredentials

from finance_server.db import (
    compute_and_store_balance_corrections,
    fetch_latest_transaction as fetch_local_latest_transaction,
    fetch_transactions as fetch_local_transactions,
    insert_transactions as insert_local_transactions,
    load_bank_credentials as load_stored_bank_credentials,
)

from .common import (
    MAX_DAYS, INITIAL_SYNC_DAYS,
    to_decimal_or_none, to_jsonable,
    build_transactions_cache_key, get_cached_transactions, set_cached_transactions,
)
from .client import (
    with_state_retry, make_client, bootstrap_client, save_state, resolve_tan_until_done,
)
from finance_server.services.payroll_parsing import enrich_paypal_merchant


def store_transactions_in_local_db(transactions: list[dict[str, Any]]) -> int:
    if not transactions:
        return 0
    result = insert_local_transactions(transactions)
    return int(result.get("inserted", 0))


def list_transactions_from_local_db(days: int | None, iban: str | None) -> list[dict[str, Any]]:
    effective_days = MAX_DAYS if days is None else days
    return fetch_local_transactions(days=effective_days, account_iban=iban)


def resolve_auto_sync_days(iban: str | None) -> int:
    latest_row = fetch_local_latest_transaction()
    if not latest_row:
        return min(MAX_DAYS, max(1, INITIAL_SYNC_DAYS))
    candidates = [latest_row.get("entry_date"), latest_row.get("date")]
    if iban and latest_row.get("account_iban") != iban:
        filtered_rows = fetch_local_transactions(days=MAX_DAYS, account_iban=iban)
        if not filtered_rows:
            return min(MAX_DAYS, max(1, INITIAL_SYNC_DAYS))
        candidates = [filtered_rows[0].get("entry_date"), filtered_rows[0].get("date")]

    latest_date: datetime.date | None = None
    for candidate in candidates:
        if not candidate:
            continue
        try:
            latest_date = datetime.datetime.strptime(str(candidate), "%d.%m.%Y").date()
            break
        except ValueError:
            try:
                latest_date = datetime.date.fromisoformat(str(candidate).split("T", 1)[0])
                break
            except ValueError:
                continue

    if latest_date is None:
        return min(MAX_DAYS, max(1, INITIAL_SYNC_DAYS))

    days = (datetime.date.today() - latest_date).days
    return max(0, min(MAX_DAYS, days))


def fetch_transactions(
    creds: BankCredentials, days: int, tan: str | None, iban: str | None
) -> dict[str, Any]:
    def _run(from_data: bytes | None, tan_value: str | None) -> dict[str, Any]:
        client = make_client(creds, from_data)
        bootstrap_client(client)
        all_columns, transactions, balances = set(), [], []
        end = datetime.date.today()

        with client:
            while isinstance(client.init_tan_response, NeedTANResponse):
                client.init_tan_response = resolve_tan_until_done(client, client.init_tan_response, tan_value)
                tan_value = None
            save_state(client, creds)

            min_start_date: datetime.date | None = None
            for account in [a for a in client.get_sepa_accounts() if not iban or a.iban == iban]:
                try:
                    bal_obj = client.get_balance(account)
                    bal_amt = getattr(bal_obj, "amount", None)
                    balances.append({
                        "iban": account.iban,
                        "amount": to_decimal_or_none(getattr(bal_amt, "amount", bal_amt)),
                        "currency": getattr(bal_amt, "currency", None),
                        "date": to_jsonable(getattr(bal_obj, "date", None)),
                    })
                except Exception:
                    logging.exception("FinTS balance fetch failed for IBAN=%s", account.iban)

                if days is not None:
                    start_date = datetime.date.today() - datetime.timedelta(days=days)
                else:
                    filtered_rows = fetch_local_transactions(days=MAX_DAYS, account_iban=account.iban)
                    if filtered_rows:
                        cand = filtered_rows[0].get("entry_date") or filtered_rows[0].get("date")
                        latest_date = None
                        if cand:
                            try:
                                latest_date = datetime.datetime.strptime(str(cand), "%d.%m.%Y").date()
                            except ValueError:
                                try:
                                    latest_date = datetime.date.fromisoformat(str(cand).split("T", 1)[0])
                                except ValueError:
                                    latest_date = None

                        if latest_date is not None:
                            start_date = latest_date
                        else:
                            start_date = datetime.date.today() - datetime.timedelta(days=INITIAL_SYNC_DAYS)
                    else:
                        start_date = datetime.date.today() - datetime.timedelta(days=INITIAL_SYNC_DAYS)

                result = client.get_transactions(account, start_date=start_date, end_date=end)

                if start_date is not None:
                    if min_start_date is None or start_date < min_start_date:
                        min_start_date = start_date

                if isinstance(result, NeedTANResponse):
                    result = resolve_tan_until_done(client, result, tan_value)
                    tan_value = None

                for item in result:
                    data = item.data if hasattr(item, "data") and isinstance(item.data, dict) else {}

                    amount_obj = data.get("amount")
                    amount_val = 0.0
                    currency_val = "EUR"
                    if amount_obj is not None:
                        amount_val = float(getattr(amount_obj, "amount", 0) or 0)
                        currency_val = str(getattr(amount_obj, "currency", "EUR") or "EUR")

                    orig_amount_obj = data.get("original_amount")
                    orig_amount_val = ""
                    if orig_amount_obj is not None:
                        orig_amount_val = str(getattr(orig_amount_obj, "amount", orig_amount_obj) or "")

                    raw_date = data.get("date") or ""
                    raw_entry_date = data.get("entry_date") or ""

                    transaction_data = {
                        "status":                         str(data.get("status") or ""),
                        "funds_code":                     str(data.get("funds_code") or ""),
                        "id":                             str(data.get("id") or ""),
                        "customer_reference":             str(data.get("customer_reference") or ""),
                        "bank_reference":                 str(data.get("bank_reference") or ""),
                        "extra_details":                 str(data.get("extra_details") or ""),

                        "date":                           str(raw_date),
                        "entry_date":                     str(raw_entry_date),
                        "guessed_entry_date":             str(data.get("guessed_entry_date") or ""),

                        "transaction_reference":         str(data.get("transaction_reference") or ""),
                        "transaction_code":               str(data.get("transaction_code") or ""),
                        "posting_text":                   str(data.get("posting_text") or ""),
                        "prima_nota":                     str(data.get("prima_nota") or ""),
                        "purpose":                        str(data.get("purpose") or ""),

                        "applicant_bic":                  str(data.get("applicant_bic") or data.get("applicant_bin") or ""),
                        "applicant_iban":                 str(data.get("applicant_iban") or ""),
                        "applicant_name":                 str(data.get("applicant_name") or ""),
                        "return_debit_notes":             str(data.get("return_debit_notes") or ""),
                        "recipient_name":                 str(data.get("recipient_name") or ""),

                        "additional_purpose":             str(data.get("additional_purpose") or ""),
                        "gvc_applicant_iban":             str(data.get("gvc_applicant_iban") or ""),
                        "gvc_applicant_bic":              str(data.get("gvc_applicant_bic") or data.get("gvc_applicant_bin") or ""),

                        "end_to_end_reference":           str(data.get("end_to_end_reference") or ""),
                        "additional_position_reference":  str(data.get("additional_position_reference") or ""),
                        "applicant_creditor_id":          str(data.get("applicant_creditor_id") or ""),
                        "purpose_code":                   str(data.get("purpose_code") or ""),
                        "additional_position_date":      str(data.get("additional_position_date") or ""),
                        "deviate_applicant":              str(data.get("deviate_applicant") or ""),
                        "deviate_recipient":              str(data.get("deviate_recipient") or ""),
                        "FRST_ONE_OFF_RECC":              str(data.get("FRST_ONE_OFF_RECC") or ""),
                        "old_SEPA_CI":                    str(data.get("old_SEPA_CI") or ""),
                        "old_SEPA_additional_position_reference": str(data.get("old_SEPA_additional_position_reference") or ""),
                        "settlement_tag":                 str(data.get("settlement_tag") or ""),
                        "debitor_identifier":             str(data.get("debitor_identifier") or ""),
                        "compensation_amount":            str(data.get("compensation_amount") or ""),

                        "original_amount":                orig_amount_val,
                        "amount":                         amount_val,
                        "currency":                       currency_val,
                    }

                    enrich_paypal_merchant(transaction_data)

                    transactions.append({
                        "account": {
                            "iban": account.iban,
                            "bic":   account.bic,
                            "accountnumber": account.accountnumber,
                            "subaccount": account.subaccount,
                            "blz": account.blz,
                        },
                        "date": transaction_data["date"],
                        "data": transaction_data,
                    })

            if days is not None:
                overall_start = datetime.date.today() - datetime.timedelta(days=days)
            else:
                overall_start = min_start_date or (datetime.date.today() - datetime.timedelta(days=INITIAL_SYNC_DAYS))

            return {
                "range": {"start": str(overall_start), "end": str(end), "days": days},
                "balances": balances, "all_columns": sorted(all_columns),
                "count": len(transactions), "transactions": transactions,
            }

    return with_state_retry(creds, _run, tan)


def fetch_and_store_transactions(
    creds: BankCredentials, days: int, tan: str | None, iban: str | None, scope: str | None = None
) -> dict[str, Any]:
    cache_key = build_transactions_cache_key(creds.username, days=days, iban=iban)
    synced_count, sync_error, rows_error = 0, None, None

    if tan is None:
        cached_payload = get_cached_transactions(cache_key)
        if cached_payload is not None:
            try:
                rows = list_transactions_from_local_db(days=None, iban=iban)
            except Exception as err:
                logging.exception("Lokale DB-Lesung fehlgeschlagen")
                rows_error, rows = str(err), []
            return {
                **cached_payload,
                "cached": True,
                "rows": rows,
                "rows_count": len(rows),
                "synced_count": 0,
                "local_db_enabled": True,
                "local_db_sync_error": None,
                "local_db_rows_error": rows_error,
            }

    payload = fetch_transactions(creds, days=days, tan=tan, iban=iban)
    try:
        synced_count = store_transactions_in_local_db(payload.get("transactions", []))
    except Exception as err:
        logging.exception("Lokale DB-Synchronisation fehlgeschlagen")
        sync_error = str(err)
    set_cached_transactions(cache_key, payload)

    try:
        effective_scope = scope
        if not effective_scope:
            stored_creds = load_stored_bank_credentials(None)
            effective_scope = stored_creds.get("scope", "unknown") if stored_creds else "unknown"
        compute_and_store_balance_corrections(effective_scope, payload.get("balances", []))
    except Exception:
        logging.exception("Saldo-Korrektur fehlgeschlagen")

    try:
        rows = list_transactions_from_local_db(days=None, iban=iban)
    except Exception as err:
        logging.exception("Lokale DB-Lesung fehlgeschlagen")
        rows_error, rows = str(err), []

    return {
        **payload,
        "cached": False,
        "rows": rows,
        "rows_count": len(rows),
        "synced_count": synced_count,
        "local_db_enabled": True,
        "local_db_sync_error": sync_error,
        "local_db_rows_error": rows_error,
    }
