from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean, stdev
from typing import Any

from finance_server.core.database import get_connection
from finance_server.db.references import resolve_zahlungspartner_logo
from finance_server.db.transactions import fetch_transactions


FREQUENCY_MONTHLY = "MONTHLY"
FREQUENCY_SEMI_ANNUAL = "SEMI_ANNUAL"
FREQUENCY_ANNUAL = "ANNUAL"

INTERVAL_LOOKBACK_DAYS = 365

FREQUENCY_LABELS = {
    FREQUENCY_MONTHLY: "Monatlich",
    FREQUENCY_SEMI_ANNUAL: "Halbjährlich",
    FREQUENCY_ANNUAL: "Jährlich",
}

MERCHANT_PREFIXES = [
    r"^PAYPAL\s+\*?\s*",
    r"^ONLINE[:\s]+",
    r"^LASTSCHRIFT\s+",
    r"^SEPA\s+",
    r"^GIROPAY\s+",
]


def _to_date(val: str | None) -> date | None:
    if not val:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


def _normalize_name(name: str) -> str:
    if not name:
        return name
    result = name.strip()
    for prefix in MERCHANT_PREFIXES:
        result = re.sub(prefix, "", result, flags=re.IGNORECASE).strip()
    return result if result else name


def _mean_interval(dates: list[date]) -> tuple[float, float] | None:
    if len(dates) < 2:
        return None
    intervals = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
    avg = mean(intervals)
    if len(intervals) >= 2:
        dev = stdev(intervals)
    else:
        dev = 0.0
    return avg, dev


def _classify_frequency(avg_days: float, dev_days: float) -> str | None:
    interval_tolerance = 0.15
    for freq, expected, dev_tolerance in [
        (FREQUENCY_MONTHLY, 30, 0.45),
        (FREQUENCY_SEMI_ANNUAL, 182.5, 0.3),
        (FREQUENCY_ANNUAL, 365, 0.3),
    ]:
        if abs(avg_days - expected) / expected <= interval_tolerance:
            if dev_days / avg_days <= dev_tolerance:
                return freq
    return None


def _clean_cluster_by_day(
    transactions: list[dict[str, Any]], max_deviation: int = 5
) -> list[dict[str, Any]]:
    if len(transactions) < 5:
        return transactions

    dated: list[tuple[dict[str, Any], date | None]] = []
    for t in transactions:
        d = _to_date(t.get("entry_date") or t.get("date"))
        if d:
            dated.append((t, d))

    if len(dated) < 4:
        return transactions

    day_counts: dict[int, int] = {}
    for _, d in dated:
        day_counts[d.day] = day_counts.get(d.day, 0) + 1 # type: ignore

    common_day = max(day_counts, key=day_counts.get) # type: ignore

    cleaned = [
        t for t, d in dated if abs(d.day - common_day) <= max_deviation # type: ignore
    ]

    return cleaned if len(cleaned) >= 2 else transactions


class SubscriptionService:
    def get_subscriptions(
        self,
        days: int = 36500,
        iban: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict[str, Any]]:
        transactions = fetch_transactions(
            days=days,
            account_iban=iban,
            from_date=from_date,
            to_date=to_date,
        )

        outgoing = [t for t in transactions if t.get("amount", 0) < 0]

        # ── Preload IBAN → zahlungspartner map ──
        iban_to_zahlungspartner: dict[str, dict[str, Any]] = {}
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT i.iban, k.id, k.name, k.website, k.logo_url, k.local_logo_path,
                       k.logo_white_background, k.logo_padding, k.is_company
                FROM ibans i
                INNER JOIN zahlungspartner k ON k.id = i.f_zahlungspartner_id
                """
            ).fetchall()
            for row in rows:
                iban_to_zahlungspartner[row["iban"]] = {
                    "id": row["id"],
                    "name": row["name"],
                    "website": row["website"],
                    "logo_url": row["logo_url"],
                    "local_logo_path": row["local_logo_path"],
                    "logo_white_background": bool(row["logo_white_background"]),
                    "logo_padding": bool(row["logo_padding"]),
                    "is_company": bool(row["is_company"]),
                }

        # ── Preload all zahlungspartner for name-based fallback ──
        with get_connection() as connection:
            all_zahlungspartner_rows = connection.execute(
                """
                SELECT id, name, website, logo_url, local_logo_path,
                       logo_white_background, logo_padding, is_company
                FROM zahlungspartner
                ORDER BY LENGTH(name) DESC
                """
            ).fetchall()
        all_zahlungspartner = [
            {
                "id": row["id"],
                "name": row["name"],
                "website": row["website"],
                "logo_url": row["logo_url"],
                "local_logo_path": row["local_logo_path"],
                "logo_white_background": bool(row["logo_white_background"]),
                "logo_padding": bool(row["logo_padding"]),
                "is_company": bool(row["is_company"]),
            }
            for row in all_zahlungspartner_rows
        ]

        # ── Preload subscription identity overrides ──
        identity_overrides: dict[tuple[str, float], dict[str, Any]] = {}
        dismissed_keys: set[tuple[str, float]] = set()
        with get_connection() as connection:
            override_rows = connection.execute(
                """
                SELECT counterparty_name, amount, display_name, f_zahlungspartner_id, dismissed
                FROM subscription_identities
                """
            ).fetchall()
        for row in override_rows:
            key = (row["counterparty_name"], row["amount"])
            if row["dismissed"]:
                dismissed_keys.add(key)
            identity_overrides[key] = {
                "display_name": row["display_name"],
                "zahlungspartner_id": row["f_zahlungspartner_id"],
            }

        # ── Step 1: Enrich every transaction with zahlungspartner + normalized name ──
        enriched_outgoing: list[dict[str, Any]] = []
        for t in outgoing:
            raw_name = t.get("applicant_name") or t.get("recipient_name") or ""
            if not raw_name:
                continue

            iban = t.get("applicant_iban") or ""
            normalized = _normalize_name(raw_name)

            zahlungspartner = None

            # 1a. IBAN-based zahlungspartner lookup
            if iban and iban in iban_to_zahlungspartner:
                zahlungspartner = iban_to_zahlungspartner[iban]

            # 1b. Name-based fallback (on normalized name)
            if zahlungspartner is None and normalized:
                nl = normalized.lower()
                best = None
                best_len = 0
                for k in all_zahlungspartner:
                    kn = (k.get("name") or "").lower()
                    if kn and kn in nl and len(kn) > best_len:
                        best = k
                        best_len = len(kn)
                zahlungspartner = best

            # The enriched name becomes the grouping key
            enriched_name: str
            if zahlungspartner and zahlungspartner["name"]:
                enriched_name = zahlungspartner["name"]
            else:
                enriched_name = normalized or raw_name

            t["_zahlungspartner"] = zahlungspartner
            t["_enriched_name"] = enriched_name
            enriched_outgoing.append(t)

        # ── Step 2: Group by enriched name (no amount in key) ──
        name_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for t in enriched_outgoing:
            name_groups[t["_enriched_name"]].append(t)

        # ── Step 3: Within each name group, cluster by amount tolerance ──
        AMOUNT_TOLERANCE = 0.10
        results: list[dict[str, Any]] = []

        for enriched_name, txs in name_groups.items():
            sorted_by_amount = sorted(txs, key=lambda t: abs(t["amount"]))

            clusters: list[list[dict[str, Any]]] = []
            current = [sorted_by_amount[0]]
            for t in sorted_by_amount[1:]:
                cluster_avg = sum(abs(x["amount"]) for x in current) / len(current)
                if abs(abs(t["amount"]) - cluster_avg) / cluster_avg <= AMOUNT_TOLERANCE:
                    current.append(t)
                else:
                    clusters.append(current)
                    current = [t]
            if current:
                clusters.append(current)

            for txs_in_cluster in clusters:
                if len(txs_in_cluster) < 2:
                    continue

                dates_sorted = sorted(
                    [
                        d
                        for d in (
                            _to_date(t.get("date") or t.get("entry_date"))
                            for t in txs_in_cluster
                        )
                        if d
                    ]
                )
                if len(dates_sorted) < 2:
                    continue

                recent_dates = [
                    d for d in dates_sorted
                    if d >= dates_sorted[-1] - timedelta(days=INTERVAL_LOOKBACK_DAYS)
                ]
                if len(recent_dates) < 2:
                    recent_dates = dates_sorted

                interval_result = _mean_interval(recent_dates)
                if interval_result is None:
                    continue

                avg_days, dev_days = interval_result

                frequency = _classify_frequency(avg_days, dev_days)
                if frequency is None and len(txs_in_cluster) >= 5:
                    cleaned = _clean_cluster_by_day(txs_in_cluster)
                    if len(cleaned) != len(txs_in_cluster):
                        cleaned_dates = sorted(
                            [
                                d
                                for d in (
                                    _to_date(
                                        t.get("date") or t.get("entry_date")
                                    )
                                    for t in cleaned
                                )
                                if d
                            ]
                        )
                        if len(cleaned_dates) >= 2:
                            recent_cleaned = [
                                d for d in cleaned_dates
                                if d >= cleaned_dates[-1] - timedelta(days=INTERVAL_LOOKBACK_DAYS)
                            ]
                            ci = _mean_interval(recent_cleaned if len(recent_cleaned) >= 2 else cleaned_dates)
                            if ci:
                                avg_days, dev_days = ci
                                frequency = _classify_frequency(
                                    avg_days, dev_days
                                )
                                if frequency:
                                    txs_in_cluster = cleaned
                                    dates_sorted = cleaned_dates

                if frequency is None:
                    continue

                last_date = max(dates_sorted)
                next_date = last_date + timedelta(days=round(avg_days))

                # Use zahlungspartner from first transaction (all should share it)
                zahlungspartner = txs_in_cluster[0].get("_zahlungspartner")

                resolved_logo = None
                datenbank_name = ""
                logo_white_background = False
                logo_padding = True
                is_company = True
                if zahlungspartner:
                    resolved_logo = resolve_zahlungspartner_logo(
                        zahlungspartner["id"],
                        zahlungspartner["website"],
                        zahlungspartner["logo_url"],
                        zahlungspartner["local_logo_path"],
                    )
                    if zahlungspartner["name"]:
                        datenbank_name = zahlungspartner["name"]
                    logo_white_background = zahlungspartner["logo_white_background"]
                    logo_padding = zahlungspartner["logo_padding"]
                    is_company = zahlungspartner["is_company"]

                # Sort by date descending for display
                transactions_sorted = sorted(
                    txs_in_cluster,
                    key=lambda t: t.get("entry_date") or t.get("date") or "",
                    reverse=True,
                )

                sub_amount = abs(transactions_sorted[0]["amount"])
                sub_identity = identity_overrides.get((enriched_name, sub_amount))
                override_zahlungspartner = None
                if sub_identity:
                    sub_identity_name = sub_identity["display_name"]
                    if sub_identity["zahlungspartner_id"] is not None:
                        with get_connection() as connection:
                            k_row = connection.execute(
                                """
                                SELECT id, name, website, logo_url, local_logo_path,
                                       logo_white_background, logo_padding, is_company
                                FROM zahlungspartner
                                WHERE id = ?
                                """,
                                (sub_identity["zahlungspartner_id"],),
                            ).fetchone()
                        if k_row:
                            override_zahlungspartner = {
                                "id": k_row["id"],
                                "name": k_row["name"],
                                "website": k_row["website"],
                                "logo_url": k_row["logo_url"],
                                "local_logo_path": k_row["local_logo_path"],
                                "logo_white_background": bool(k_row["logo_white_background"]),
                                "logo_padding": bool(k_row["logo_padding"]),
                                "is_company": bool(k_row["is_company"]),
                            }
                else:
                    sub_identity_name = None

                if override_zahlungspartner:
                    override_resolved_logo = resolve_zahlungspartner_logo(
                        override_zahlungspartner["id"],
                        override_zahlungspartner["website"],
                        override_zahlungspartner["logo_url"],
                        override_zahlungspartner["local_logo_path"],
                    )
                    sub_name = override_zahlungspartner["name"]
                    sub_logo = override_resolved_logo
                    sub_datenbank = override_zahlungspartner["name"]
                    sub_logo_white = override_zahlungspartner["logo_white_background"]
                    sub_logo_padding = override_zahlungspartner["logo_padding"]
                    sub_is_company = override_zahlungspartner["is_company"]
                elif sub_identity_name:
                    sub_name = sub_identity_name
                    sub_logo = None
                    sub_datenbank = ""
                    sub_logo_white = False
                    sub_logo_padding = True
                    sub_is_company = True
                else:
                    sub_name = enriched_name
                    sub_logo = resolved_logo
                    sub_datenbank = datenbank_name
                    sub_logo_white = logo_white_background
                    sub_logo_padding = logo_padding
                    sub_is_company = is_company

                sub_recipient_id = (
                    override_zahlungspartner["id"]
                    if override_zahlungspartner
                    else (zahlungspartner["id"] if zahlungspartner else None)
                )

                results.append(
                    {
                        "name": sub_name,
                        "_counterpartyName": enriched_name,
                        "recipientLogo": sub_logo,
                        "recipientName": txs_in_cluster[0].get("recipient_name") or "",
                        "recipientId": sub_recipient_id,
                        "datenbankName": sub_datenbank,
                        "logoWhiteBackground": sub_logo_white,
                        "logoPadding": sub_logo_padding,
                        "isCompany": sub_is_company,
                        "amount": sub_amount,
                        "frequency": frequency,
                        "frequencyLabel": FREQUENCY_LABELS[frequency],
                        "firstDate": dates_sorted[0].isoformat(),
                        "lastDate": last_date.isoformat(),
                        "nextDate": next_date.isoformat(),
                        "transactionCount": len(txs_in_cluster),
                        "transactionIds": sorted([t["id"] for t in txs_in_cluster]),
                        "sequenztyp": "",
                        "transactions": [
                            {
                                "id": t["id"],
                                "amount": t["amount"],
                                "date": t.get("entry_date") or t.get("date") or "",
                                "purpose": t.get("purpose") or "",
                                "applicantName": t.get("applicant_name") or "",
                                "recipientName": t.get("recipient_name") or "",
                                "note": t.get("note"),
                            }
                            for t in transactions_sorted
                        ],
                    }
                )

        # ── Step 4: Add refund info ──
        all_tx_ids = [tid for r in results for tid in r["transactionIds"]]
        if all_tx_ids:
            placeholders = ",".join("?" for _ in all_tx_ids)
            with get_connection() as connection:
                refund_rows = connection.execute(
                    f"""
                    SELECT refund_ref_transaction_id, SUM(amount) as refund_total
                    FROM umsaetze
                    WHERE refund_ref_transaction_id IN ({placeholders})
                    GROUP BY refund_ref_transaction_id
                    """,
                    all_tx_ids,
                ).fetchall()
            refund_map = {row["refund_ref_transaction_id"]: abs(row["refund_total"]) for row in refund_rows}
        else:
            refund_map = {}

        for r in results:
            refund_total = 0
            net_sum = 0.0
            for tx in r["transactions"]:
                tx_refund = refund_map.get(tx["id"], 0)
                refund_total += tx_refund
                tx_net = max(0, abs(tx["amount"]) - tx_refund)
                net_sum += tx_net
            r["refundAmount"] = refund_total
            r["effectiveAmount"] = round(net_sum / r["transactionCount"], 2) if r["transactionCount"] > 0 else r["amount"]

        # ── Step 5: Filter out inactive subscriptions ──
        today = date.today()
        FREQUENCY_MAX_AGE_DAYS = {
            FREQUENCY_MONTHLY: 45,
            FREQUENCY_SEMI_ANNUAL: 212,
            FREQUENCY_ANNUAL: 395,
        }

        def _is_active(sub: dict[str, Any]) -> bool:
            freq = sub.get("frequency", "")
            max_age = FREQUENCY_MAX_AGE_DAYS.get(freq)
            if max_age is None:
                return True
            last = _to_date(sub.get("lastDate"))
            if last is None:
                return True
            return (today - last).days <= max_age

        results = [
            r
            for r in results
            if _is_active(r)
            and (r.get("_counterpartyName"), r.get("amount")) not in dismissed_keys
        ]

        results.sort(key=lambda r: r["lastDate"], reverse=True)
        return results
