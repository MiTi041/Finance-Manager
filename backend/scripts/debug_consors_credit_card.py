"""Diagnose: warum liefert die Consorsbank-Kreditkarte keine (vorgemerkten) Umsaetze?

Read-only: liest nur Credentials/State, schreibt nichts in die DB.
Aufruf (aus backend/):  .venv/bin/python -m scripts.debug_consors_credit_card
"""

from __future__ import annotations

import argparse
import datetime
import logging
import sys
import traceback

from fints.client import NeedTANResponse

# ponytail: vor fints importieren, sonst Zirkularimport beim Standalone-Start
import finance_server.services.overdraw_notify  # noqa: F401
from finance_server.db import load_bank_credentials
from finance_server.fints.client import (
    _capture_tan_medium_from_challenge,
    _collect_bank_feedback,
    bootstrap_client,
    make_client,
    resolve_tan_until_done,
)
from finance_server.models.bank import BankCredentials

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logging.getLogger("fints").setLevel(logging.WARNING)


def _resolve(client, result, tan=None):
    if isinstance(result, NeedTANResponse):
        _capture_tan_medium_from_challenge(client, result)
        print(f">>> TAN erforderlich: decoupled={result.decoupled} challenge={result.challenge!r}")
        result = resolve_tan_until_done(client, result, tan)
    return result


def _dump_feedback(client) -> None:
    feedback = _collect_bank_feedback(client)
    if feedback:
        print("    Bank-Codes:", "; ".join(f"{code}: {text}" for code, text in feedback))


def main() -> int:
    sys.stdout.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", default="consorsbank:290317792001")
    parser.add_argument("--iban", default="DE59760300800130350259")
    parser.add_argument("--days", type=int, default=120)
    args = parser.parse_args()

    stored = load_bank_credentials(args.scope)
    if not stored:
        print(f"Keine Credentials fuer scope={args.scope}")
        return 1
    creds = BankCredentials.model_validate(stored)
    print(f"scope={args.scope} bank_key={creds.bank_key} username={creds.username}")

    client = make_client(creds, None)
    bootstrap_client(client)

    with client:
        while isinstance(client.init_tan_response, NeedTANResponse):
            _capture_tan_medium_from_challenge(client)
            client.init_tan_response = resolve_tan_until_done(
                client, client.init_tan_response, None
            )

        info = client.get_information()
        ops = info.get("bank", {}).get("supported_operations") or {}
        print("\n--- Bank supported_operations ---")
        for name, supported in sorted(ops.items(), key=lambda kv: getattr(kv[0], "name", str(kv[0]))):
            if supported:
                print(f"  {name}: {supported}")

        print("\n--- BPD Segmente (Kontoauszuege) ---")
        for name in ("HIKAZS", "HICAZS", "DIKKUS", "DKKKUS"):
            for seg in client.bpd.find_segments(name) or []:
                print(f"  {name}: version={seg.header.version}")

        accounts = client.get_sepa_accounts()
        print("\n--- SEPA-Konten ---")
        for acc in accounts:
            print(f"  {acc.iban}  nr={acc.accountnumber}  bic={acc.bic}")
        target = next(
            (a for a in accounts if "".join(a.iban.split()).upper() == args.iban.upper()), None
        )
        if target is None:
            print(f"\n!! Ziel-IBAN {args.iban} ist NICHT in get_sepa_accounts() enthalten")
            return 1

        for acc in info.get("accounts", []):
            if "".join(str(acc.get("iban", "")).split()).upper() == args.iban.upper():
                print("\n--- HIUPD-Kontoinfo ---")
                for key in ("account_number", "type", "product_name", "allowed_transactions"):
                    print(f"  {key}: {acc.get(key)}")

        end = datetime.date.today()
        start = end - datetime.timedelta(days=args.days)

        print("\n--- get_balance (HKSAL) ---")
        try:
            bal = _resolve(client, client.get_balance(target))
            print(f"  {getattr(bal, 'date', None)} {getattr(bal, 'amount', None)}")
        except Exception as err:
            print(f"  EXCEPTION: {err!r}")
            _dump_feedback(client)

        print(f"\n--- get_transactions (HKKAZ/HKCAZ) {start}..{end} ---")
        try:
            result = _resolve(
                client,
                client.get_transactions(
                    target, start_date=start, end_date=end, include_pending=True
                ),
            )
            print(f"  Ergebnis: {len(result)} Umsaetze")
            for tx in result:
                data = getattr(tx, "data", {}) or {}
                print(
                    f"    pending={data.get('is_pending')} date={data.get('date')} "
                    f"amount={getattr(data.get('amount'), 'amount', data.get('amount'))} "
                    f"purpose={data.get('purpose') or data.get('posting_text')!r}"
                )
        except Exception as err:
            print(f"  EXCEPTION: {err!r}")
            _dump_feedback(client)
            traceback.print_exc()

        print(f"\n--- get_credit_card_transactions (DKKKU) {start}..{end} ---")
        try:
            result = _resolve(
                client,
                client.get_credit_card_transactions(
                    target,
                    credit_card_number=target.accountnumber,
                    start_date=start,
                    end_date=end,
                ),
            )
            count = len(result) if hasattr(result, "__len__") else result
            print(f"  Ergebnis: {count}")
            for tx in result if hasattr(result, "__iter__") else []:
                data = getattr(tx, "data", {}) or {}
                print(
                    f"    pending={data.get('is_pending')} date={data.get('date')} "
                    f"amount={getattr(data.get('amount'), 'amount', data.get('amount'))} "
                    f"purpose={data.get('purpose') or data.get('posting_text')!r}"
                )
        except Exception as err:
            print(f"  EXCEPTION: {err!r}")
            _dump_feedback(client)
            traceback.print_exc()

    return 0


if __name__ == "__main__":
    sys.exit(main())
