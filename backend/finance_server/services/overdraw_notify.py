from __future__ import annotations

import logging
from typing import Any

import requests

from datetime import datetime

from finance_server.db import delete_setting, get_connection, get_setting, set_setting
from finance_server.services.api_keys import get_external_key

RESEND_URL = "https://api.resend.com/emails"


def _fmt(amount: float) -> str:
    return f"{amount:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _account_names(scope: str) -> dict[str, str]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT iban, account_name FROM bank_accounts WHERE scope = ?",
            (scope,),
        ).fetchall()
    return {row["iban"]: (row["account_name"] or row["iban"]) for row in rows}


def _send_email(scope: str, overruns: list[dict[str, Any]], to_addr: str) -> None:
    from_addr = get_external_key("resend_from") or "Finance-Warnung <onboarding@resend.dev>"
    timestamp = datetime.now().strftime("%d.%m.%Y %H:%M")

    rows = []
    for entry in overruns:
        iban = entry["iban"]
        name = entry.get("name") or iban
        total = entry["total"]
        balance = entry["balance"]
        deficit = -(balance + total)
        rows.append(
            f"""
            <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                    <div style="font-weight:600;color:#111827;">{name}</div>
                    <div style="font-size:13px;color:#6b7280;font-family:monospace;">{iban}</div>
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">{_fmt(balance)}</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">{_fmt(total)}</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:#b91c1c;">{_fmt(deficit)}</td>
            </tr>
            """
        )

    body = f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:32px 16px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <div style="background:#b91c1c;padding:20px 24px;">
          <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">
            ⚠️ Warnung: Vorgemerkte Umsätze übersteigen das Guthaben
          </h1>
        </div>

        <div style="padding:24px;">
          <p style="margin:0 0 16px 0;color:#374151;font-size:14px;line-height:1.5;">
            Bei den folgenden Konten übersteigen die vorgemerkten (noch nicht gebuchten) Umsätze
            das aktuelle Guthaben. Bitte prüfen Sie die betroffenen Konten zeitnah.
          </p>

          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px 16px;text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Konto</th>
                <th style="padding:10px 16px;text-align:right;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Guthaben</th>
                <th style="padding:10px 16px;text-align:right;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Vorgemerkt</th>
                <th style="padding:10px 16px;text-align:right;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Überziehung</th>
              </tr>
            </thead>
            <tbody>
              {''.join(rows)}
            </tbody>
          </table>

          <p style="margin:20px 0 0 0;color:#9ca3af;font-size:12px;">
            {len(overruns)} betroffene{'s' if len(overruns) == 1 else ''} Konto{'s' if len(overruns) != 1 else ''} · Stand: {timestamp}
          </p>
        </div>

        <div style="background:#f9fafb;padding:16px 24px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            Diese Benachrichtigung wurde automatisch generiert.
          </p>
        </div>

      </div>
    </div>
    """

    resp = requests.post(
        RESEND_URL,
        headers={
            "Authorization": f"Bearer {get_external_key('resend_api_key')}",
            "Content-Type": "application/json",
        },
        json={
            "from": from_addr,
            "to": [to_addr],
            "subject": "Warnung: Vorgemerkte Umsätze übersteigen das Guthaben",
            "html": body,
        },
        timeout=15,
    )
    if resp.status_code >= 300:
        logging.error("Resend email failed: %s %s", resp.status_code, resp.text)
    else:
        logging.info("Resend pending-overdraw email sent (scope=%s)", scope)


def _sent_flag(iban: str) -> str:
    return f"overdraw_email_sent:{iban}"


def _notification_email() -> str | None:
    return (get_setting("notify_email") or "").strip() or None


def check_pending_overdraw(scope: str, balances: list[dict[str, Any]], pending: list[dict[str, Any]]) -> None:
    """Send at most one email per account when pending would exceed the balance.

    Edge-triggered: a sent-marker is stored as soon as an overrun appears and
    removed as soon as it clears. One continuous overrun => exactly one email;
    overrun -> cleared -> overrun yields a second one.
    """
    if not get_external_key("resend_api_key") or not _notification_email():
        return

    try:
        pending_by_iban: dict[str, float] = {}
        for entry in pending:
            account = entry.get("account") or {}
            iban = (account.get("iban") or "").strip().upper()
            data = entry.get("data") or {}
            amount = data.get("amount")
            if not iban or amount is None:
                continue
            pending_by_iban[iban] = pending_by_iban.get(iban, 0.0) + float(amount)

        if not pending_by_iban:
            return

        balance_by_iban = {
            (b.get("iban") or "").strip().upper(): float(b.get("amount") or 0)
            for b in balances
        }
        names = _account_names(scope)

        overruns: list[dict[str, Any]] = []
        for iban, pending_total in pending_by_iban.items():
            if pending_total >= 0:
                continue
            balance = balance_by_iban.get(iban, 0.0)
            if balance + pending_total < 0:
                overruns.append({
                    "iban": iban,
                    "name": names.get(iban, "Konto"),
                    "total": pending_total,
                    "balance": balance,
                })

        overrun_ibans = {entry["iban"] for entry in overruns}

        fresh = [entry for entry in overruns if get_setting(_sent_flag(entry["iban"])) != "1"]
        for entry in fresh:
            set_setting(_sent_flag(entry["iban"]), "1")

        for iban in pending_by_iban:
            if iban not in overrun_ibans:
                delete_setting(_sent_flag(iban))

        if fresh:
            _send_email(scope, fresh, _notification_email())
    except Exception:
        logging.exception("Pending-overdraw email check failed")