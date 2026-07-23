from __future__ import annotations

import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen
from typing import Any, cast
import sqlite3

from finance_server.core.config import settings
from finance_server.core.database import get_connection

from .utils import normalize_text


def _log(table_name: str, row_id: int | None, op_type: str, data: Any = None) -> None:
    from finance_server.services.sync_logger import log_crud_event
    log_crud_event(table_name, row_id, op_type, data)


def _coerce_bool(value: Any, default: bool = True) -> int:
    if value is None:
        return 1 if default else 0

    if isinstance(value, bool):
        return 1 if value else 0

    text = normalize_text(value).lower()
    if not text:
        return 1 if default else 0

    if text in {"1", "true", "yes", "y", "company", "unternehmens", "unternehmen"}:
        return 1
    if text in {"0", "false", "no", "n", "person", "einzelperson"}:
        return 0

    return 1 if default else 0


def _normalize_optional_text(value: Any) -> str | None:
    text = normalize_text(value)
    return text or None


def _normalize_domain(value: str | None) -> str:
    if not value:
        return ""

    candidate = value.strip()
    if not candidate:
        return ""

    if not candidate.startswith(("http://", "https://")):
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)
    domain = parsed.netloc or parsed.path
    domain = domain.split("/")[0].split(":")[0].strip().lower()

    if domain.startswith("www."):
        domain = domain[4:]

    return domain


def _resolve_local_logo_path(logo_url: str | None) -> Path | None:
    if not logo_url:
        return None

    candidate = logo_url.strip()
    if not candidate:
        return None

    parsed = urlparse(candidate)
    if parsed.scheme in {"http", "https", "data"}:
        return None

    if parsed.scheme == "file":
        path = Path(unquote(parsed.path or ""))
    else:
        path = Path(candidate).expanduser()

    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()

    if not path.exists() or not path.is_file():
        return None

    return path


_hunter_logo_cache: dict[str, str | None] = {}

def _resolve_hunter_company_logo(domain: str) -> str | None:
    if domain in _hunter_logo_cache:
        return _hunter_logo_cache[domain]
    hunter_key = settings.hunter_logo_key.strip()
    if not hunter_key or not domain:
        _hunter_logo_cache[domain] = None
        return None

    url = f"https://api.hunter.io/v2/companies/find?domain={domain}&api_key={hunter_key}"
    request = Request(url, headers={"Accept": "application/json"})

    try:
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None

    logo = payload.get("data", {}).get("logo") if isinstance(payload, dict) else None
    result = logo.strip() if isinstance(logo, str) and logo.strip() else None
    _hunter_logo_cache[domain] = result
    return result


def _store_zahlungspartner_logo(zahlungspartner_id: int, logo_url: str) -> None:
    from finance_server.core.database import get_connection

    for attempt in range(3):
        try:
            with get_connection() as connection:
                connection.execute(
                    """
                    UPDATE zahlungspartner
                    SET logo_url = ?
                    WHERE id = ?
                      AND (logo_url IS NULL OR TRIM(logo_url) = '' OR logo_url != ?)
                    """,
                    (logo_url, zahlungspartner_id, logo_url),
                )
                connection.commit()
            return
        except sqlite3.OperationalError as error:
            if "locked" not in str(error).lower() or attempt >= 2:
                return
            time.sleep(0.2 * (attempt + 1))


def _serialize_zahlungspartner_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "website": row["website"],
        "logo_url": row["logo_url"],
        "local_logo_path": row["local_logo_path"],
        "logo_white_background": bool(row["logo_white_background"]),
        "logo_padding": bool(row["logo_padding"]),
        "is_company": bool(row["is_company"]),
    }


def list_zahlungspartner_records() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, website, logo_url, local_logo_path, logo_white_background, logo_padding, is_company
            FROM zahlungspartner
            ORDER BY name COLLATE NOCASE ASC, id ASC
            """
        ).fetchall()

        iban_rows = connection.execute(
            """
            SELECT iban, f_zahlungspartner_id
            FROM ibans
            ORDER BY iban ASC
            """
        ).fetchall()

    records = [_serialize_zahlungspartner_row(row) for row in rows]
    by_id = {record["id"]: record for record in records}
    for record in records:
        record["ibans"] = []

    for row in iban_rows:
        owner = by_id.get(row["f_zahlungspartner_id"])
        if owner is not None:
            owner["ibans"].append(row["iban"])

    return records


def create_zahlungspartner_record(payload: dict[str, Any]) -> dict[str, Any]:
    name = normalize_text(payload.get("name"))
    if not name:
        raise ValueError("Zahlungspartner-Name fehlt.")

    website = _normalize_optional_text(payload.get("website"))
    logo_url = _normalize_optional_text(payload.get("logo_url"))
    logo_white_background = _coerce_bool(
        payload.get("logo_white_background"),
        default=False,
    )
    logo_padding = _coerce_bool(
        payload.get("logo_padding"),
        default=False,
    )
    is_company = _coerce_bool(payload.get("is_company"), default=True)

    if not is_company:
        website = None
        logo_url = None
        logo_white_background = 0
        logo_padding = 0

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO zahlungspartner (
                name,
                website,
                logo_url,
                logo_white_background,
                logo_padding,
                is_company
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (name, website, logo_url, logo_white_background, logo_padding, is_company),
        )
        zahlungspartner_id = cast(int, cursor.lastrowid)

    if website and not logo_url:
        resolve_zahlungspartner_logo(zahlungspartner_id, website, None)

    record = get_zahlungspartner_record(zahlungspartner_id)
    if record is None:
        return {
            "id": zahlungspartner_id,
            "name": name,
            "website": website,
            "logo_url": logo_url,
            "logo_white_background": bool(logo_white_background),
            "logo_padding": bool(logo_padding),
            "is_company": bool(is_company),
            "ibans": [],
        }

    _log("zahlungspartner", zahlungspartner_id, "INSERT", record)
    return record


def update_zahlungspartner_record(zahlungspartner_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
    current = get_zahlungspartner_record(zahlungspartner_id)
    if current is None:
        return None

    fields: list[str] = []
    params: list[Any] = []
    next_is_company = _coerce_bool(
        payload.get("is_company", current.get("is_company")),
        default=bool(current.get("is_company")),
    )

    if "name" in payload:
        name = normalize_text(payload.get("name"))
        if not name:
            raise ValueError("Zahlungspartner-Name fehlt.")
        fields.append("name = ?")
        params.append(name)

    if next_is_company:
        if "website" in payload:
            fields.append("website = ?")
            params.append(_normalize_optional_text(payload.get("website")))

        if "logo_url" in payload:
            fields.append("logo_url = ?")
            params.append(_normalize_optional_text(payload.get("logo_url")))

        if "local_logo_path" in payload:
            fields.append("local_logo_path = ?")
            params.append(_normalize_optional_text(payload.get("local_logo_path")))

        if "logo_white_background" in payload:
            fields.append("logo_white_background = ?")
            params.append(
                _coerce_bool(payload.get("logo_white_background"), default=False)
            )

        if "logo_padding" in payload:
            fields.append("logo_padding = ?")
            params.append(
                _coerce_bool(payload.get("logo_padding"), default=True)
            )
    else:
        if "website" in payload:
            fields.append("website = ?")
            params.append(None)
        if "logo_url" in payload:
            fields.append("logo_url = ?")
            params.append(None)
        if "logo_white_background" in payload:
            fields.append("logo_white_background = ?")
            params.append(0)
        if "logo_padding" in payload:
            fields.append("logo_padding = ?")
            params.append(0)

    if "is_company" in payload:
        fields.append("is_company = ?")
        params.append(next_is_company)

    if not fields:
        return get_zahlungspartner_record(zahlungspartner_id)

    params.append(zahlungspartner_id)

    with get_connection() as connection:
        cursor = connection.execute(
            f"UPDATE zahlungspartner SET {', '.join(fields)} WHERE id = ?",
            params,
        )
        if cursor.rowcount <= 0:
            return None

    updated = get_zahlungspartner_record(zahlungspartner_id)
    if updated is not None and updated.get("website") and not updated.get("logo_url"):
        resolve_zahlungspartner_logo(
            zahlungspartner_id,
            updated.get("website"),
            None,
        )
        updated = get_zahlungspartner_record(zahlungspartner_id)

    _log("zahlungspartner", zahlungspartner_id, "UPDATE", updated)
    return updated


def delete_zahlungspartner_record(zahlungspartner_id: int) -> bool:
    with get_connection() as connection:
        owner = connection.execute(
            "SELECT id FROM zahlungspartner WHERE id = ?",
            (zahlungspartner_id,),
        ).fetchone()
        if owner is None:
            return False

        connection.execute(
            "DELETE FROM ibans WHERE f_zahlungspartner_id = ?",
            (zahlungspartner_id,),
        )
        connection.execute(
            "DELETE FROM zahlungspartner WHERE id = ?",
            (zahlungspartner_id,),
        )

    _log("zahlungspartner", zahlungspartner_id, "DELETE")
    return True


def get_zahlungspartner_record(zahlungspartner_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, name, website, logo_url, local_logo_path, logo_white_background, logo_padding, is_company
            FROM zahlungspartner
            WHERE id = ?
            """,
            (zahlungspartner_id,),
        ).fetchone()

        if row is None:
            return None

        iban_rows = connection.execute(
            """
            SELECT iban
            FROM ibans
            WHERE f_zahlungspartner_id = ?
            ORDER BY iban ASC
            """,
            (zahlungspartner_id,),
        ).fetchall()

    record = _serialize_zahlungspartner_row(row)
    record["ibans"] = [iban_row["iban"] for iban_row in iban_rows]
    return record


def list_zahlungspartner_iban_mappings() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                i.iban,
                i.f_zahlungspartner_id,
                k.name AS zahlungspartner_name,
                k.website AS zahlungspartner_website,
                k.logo_url AS zahlungspartner_logo_url,
                k.local_logo_path AS zahlungspartner_local_logo_path,
                k.logo_white_background AS zahlungspartner_logo_white_background,
                k.logo_padding AS zahlungspartner_logo_padding,
                k.is_company AS zahlungspartner_is_company
            FROM ibans i
            INNER JOIN zahlungspartner k ON k.id = i.f_zahlungspartner_id
            ORDER BY i.iban ASC
            """
        ).fetchall()

    return [
        {
            "iban": row["iban"],
            "f_zahlungspartner_id": row["f_zahlungspartner_id"],
            "zahlungspartner_name": row["zahlungspartner_name"],
            "zahlungspartner_website": row["zahlungspartner_website"],
            "zahlungspartner_logo_url": row["zahlungspartner_logo_url"],
            "zahlungspartner_local_logo_path": row["zahlungspartner_local_logo_path"],
            "zahlungspartner_logo_white_background": bool(
                row["zahlungspartner_logo_white_background"]
            ),
            "zahlungspartner_logo_padding": bool(
                row["zahlungspartner_logo_padding"]
            ),
            "zahlungspartner_is_company": bool(row["zahlungspartner_is_company"]),
        }
        for row in rows
    ]


def _serialize_empfaengerkonto_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "account_name": row["account_name"],
        "iban": row["iban"],
        "bic": row["bic"],
        "recipient_name": row["recipient_name"],
        "is_donation_account": bool(row["is_donation_account"]),
    }


def list_empfaengerkonten_records() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, account_name, iban, bic, recipient_name, is_donation_account
            FROM empfaengerkonten
            ORDER BY recipient_name COLLATE NOCASE ASC, account_name COLLATE NOCASE ASC, iban ASC
            """
        ).fetchall()

    return [_serialize_empfaengerkonto_row(row) for row in rows]


def get_empfaengerkonto_record(empfaengerkonto_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, account_name, iban, bic, recipient_name, is_donation_account
            FROM empfaengerkonten
            WHERE id = ?
            """,
            (empfaengerkonto_id,),
        ).fetchone()

    if row is None:
        return None

    return _serialize_empfaengerkonto_row(row)


def create_empfaengerkonto_record(payload: dict[str, Any]) -> dict[str, Any]:
    account_name = normalize_text(payload.get("account_name"))
    iban = normalize_text(payload.get("iban")).replace(" ", "").upper()
    bic = _normalize_optional_text(payload.get("bic"))
    recipient_name = normalize_text(payload.get("recipient_name"))
    is_donation_account = _coerce_bool(
        payload.get("is_donation_account"),
        default=False,
    )

    if not account_name:
        raise ValueError("Kontoname fehlt.")
    if not iban:
        raise ValueError("IBAN fehlt.")
    if not recipient_name:
        raise ValueError("Empfängername fehlt.")

    bic = bic.upper() if bic else None

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM empfaengerkonten WHERE UPPER(iban) = UPPER(?)",
            (iban,),
        ).fetchone()
        if existing is not None:
            raise ValueError("Für diese IBAN existiert bereits ein Empfängerkonto.")

        cursor = connection.execute(
            """
            INSERT INTO empfaengerkonten (
                account_name,
                iban,
                bic,
                recipient_name,
                is_donation_account
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (account_name, iban, bic, recipient_name, is_donation_account),
        )
        empfaengerkonto_id = cast(int, cursor.lastrowid)

    record = get_empfaengerkonto_record(empfaengerkonto_id)
    if record is None:
        return {
            "id": empfaengerkonto_id,
            "account_name": account_name,
            "iban": iban,
            "bic": bic,
            "recipient_name": recipient_name,
            "is_donation_account": bool(is_donation_account),
        }

    _log("empfaengerkonten", empfaengerkonto_id, "INSERT", record)
    return record


def update_empfaengerkonto_record(
    empfaengerkonto_id: int,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    current = get_empfaengerkonto_record(empfaengerkonto_id)
    if current is None:
        return None

    fields: list[str] = []
    params: list[Any] = []

    if "account_name" in payload:
        account_name = normalize_text(payload.get("account_name"))
        if not account_name:
            raise ValueError("Kontoname fehlt.")
        fields.append("account_name = ?")
        params.append(account_name)

    if "iban" in payload:
        iban = normalize_text(payload.get("iban")).replace(" ", "").upper()
        if not iban:
            raise ValueError("IBAN fehlt.")
        with get_connection() as connection:
            existing = connection.execute(
                """
                SELECT id
                FROM empfaengerkonten
                WHERE UPPER(iban) = UPPER(?)
                  AND id != ?
                """,
                (iban, empfaengerkonto_id),
            ).fetchone()
            if existing is not None:
                raise ValueError("Für diese IBAN existiert bereits ein Empfängerkonto.")
        fields.append("iban = ?")
        params.append(iban)

    if "bic" in payload:
        bic = _normalize_optional_text(payload.get("bic"))
        fields.append("bic = ?")
        params.append(bic.upper() if bic else None)

    if "recipient_name" in payload:
        recipient_name = normalize_text(payload.get("recipient_name"))
        if not recipient_name:
            raise ValueError("Empfängername fehlt.")
        fields.append("recipient_name = ?")
        params.append(recipient_name)

    if "is_donation_account" in payload:
        fields.append("is_donation_account = ?")
        params.append(
            _coerce_bool(payload.get("is_donation_account"), default=False),
        )

    if not fields:
        return current

    params.append(empfaengerkonto_id)

    with get_connection() as connection:
        cursor = connection.execute(
            f"UPDATE empfaengerkonten SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            params,
        )
        if cursor.rowcount <= 0:
            return None

    record = get_empfaengerkonto_record(empfaengerkonto_id)
    _log("empfaengerkonten", empfaengerkonto_id, "UPDATE", record)
    return record


def delete_empfaengerkonto_record(empfaengerkonto_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM empfaengerkonten WHERE id = ?",
            (empfaengerkonto_id,),
        )

    result = cursor.rowcount > 0
    _log("empfaengerkonten", empfaengerkonto_id, "DELETE")
    return result


def update_zahlungspartner_iban_mapping(iban: str, zahlungspartner_id: int) -> bool:
    normalized_iban = normalize_text(iban)
    if not normalized_iban:
        return False

    with get_connection() as connection:
        owner = connection.execute(
            "SELECT id FROM zahlungspartner WHERE id = ?",
            (zahlungspartner_id,),
        ).fetchone()
        if owner is None:
            return False

        connection.execute(
            """
            INSERT INTO ibans (iban, f_zahlungspartner_id)
            VALUES (?, ?)
            ON CONFLICT(iban) DO UPDATE SET
                f_zahlungspartner_id = excluded.f_zahlungspartner_id
            """,
            (normalized_iban, zahlungspartner_id),
        )
        return True


def resolve_zahlungspartner_logo(
    zahlungspartner_id: int,
    website: str | None,
    fallback_logo_url: str | None,
    local_logo_path: str | None = None,
) -> str | None:
    stored_local_logo = (local_logo_path or "").strip()
    if stored_local_logo:
        return stored_local_logo

    stored_logo = (fallback_logo_url or "").strip()
    if stored_logo:
        if _resolve_local_logo_path(stored_logo) is not None:
            return f"/api/reference-data/zahlungspartner/{zahlungspartner_id}/logo"
        return stored_logo

    domain = _normalize_domain(website)
    if domain:
        hunter_logo = _resolve_hunter_company_logo(domain)
        if hunter_logo:
            _store_zahlungspartner_logo(zahlungspartner_id, hunter_logo)
            return hunter_logo

    return None


def get_zahlungspartner_by_iban(iban: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT k.id, k.name, k.website, k.logo_url, k.local_logo_path,
                   k.logo_white_background, k.logo_padding, k.is_company
            FROM ibans i
            INNER JOIN zahlungspartner k ON k.id = i.f_zahlungspartner_id
            WHERE i.iban = ?
            """,
            (iban,),
        ).fetchone()
    if row is None:
        return None
    return _serialize_zahlungspartner_row(row)


def list_iban_zahlungspartner_references() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                k.id AS zahlungspartner_id,
                i.iban,
                i.f_zahlungspartner_id,
                k.name AS zahlungspartner_name,
                k.website AS zahlungspartner_website,
                k.logo_url AS zahlungspartner_logo_url
                , k.local_logo_path AS zahlungspartner_local_logo_path
                , k.logo_white_background AS zahlungspartner_logo_white_background
                , k.logo_padding AS zahlungspartner_logo_padding
                , k.is_company AS zahlungspartner_is_company
            FROM ibans i
            INNER JOIN zahlungspartner k ON k.id = i.f_zahlungspartner_id
            ORDER BY i.iban
            """
        ).fetchall()

    return [
        {
            "zahlungspartner_id": row["zahlungspartner_id"],
            "iban": row["iban"],
            "f_zahlungspartner_id": row["f_zahlungspartner_id"],
            "zahlungspartner_name": row["zahlungspartner_name"],
            "zahlungspartner_website": row["zahlungspartner_website"],
            "zahlungspartner_logo_url": row["zahlungspartner_logo_url"],
            "zahlungspartner_local_logo_path": row["zahlungspartner_local_logo_path"],
            "zahlungspartner_logo_white_background": bool(
                row["zahlungspartner_logo_white_background"]
            ),
            "zahlungspartner_logo_padding": bool(
                row["zahlungspartner_logo_padding"]
            ),
            "zahlungspartner_is_company": bool(row["zahlungspartner_is_company"]),
            "resolved_logo_url": resolve_zahlungspartner_logo(
                row["zahlungspartner_id"],
                row["zahlungspartner_website"],
                row["zahlungspartner_logo_url"],
                row["zahlungspartner_local_logo_path"],
            ),
        }
        for row in rows
    ]
