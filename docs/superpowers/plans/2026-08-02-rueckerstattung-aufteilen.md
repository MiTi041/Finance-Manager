# Rückerstattung aufteilen — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Einnahme (Gutschrift) kann mit anteiligen Beträgen als Rückerstattung für mehrere Ausgaben verknüpft werden; die Einnahme wird nie über 0 aufgeteilt, eine Ausgabe nie unter 0 erstattet.

**Architecture:** Neue Many-to-Many-Tabelle `refund_links` ersetzt `umsaetze.refund_ref_transaction_id` (Backfill + DROP COLUMN). `refund_total` bleibt als Cache. Reporting zählt Einnahmen als `Betrag − aufgeteilt`, Ausgaben als `ABS(Betrag) − refund_total`. Frontend: Incoming-Section mit Link-Liste, Betragseingabe und "Rest"-Anzeige; Add-Button ausgeblendet bei Rest 0.

**Tech Stack:** Python FastAPI + SQLite, React + TypeScript + Tailwind/shadcn-ui.

## Global Constraints

- Python ≥ 3.11, SQLite ≥ 3.35 (env hat 3.51 → `ALTER TABLE … DROP COLUMN` verfügbar).
- Ruff/Black line-length 100, `quote-style = "double"`.
- Keine neuen Abhängigkeiten.
- Betragsvergleiche mit Epsilon: Backend `1e-9`, Frontend `0.005`.
- `refund_total`-Spalte bleibt bestehen (Cache für Ausgabenseite).
- Backend-Tests: `backend/.venv/bin/python -m pytest` (testpaths `tests`).
- Frontend-Verifikation: `pnpm --dir frontend exec tsc --noEmit`.
- Der Working-Tree auf `dev` enthält **unabhängige, uncommittete** Änderungen (allocation/savings). Nur die im jeweiligen Commit gelisteten Dateien stagen — niemals `git add .` oder `git add -A`.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `backend/finance_server/core/schema.py` | Tabelle `refund_links` + Migration (Backfill, DROP COLUMN) |
| `backend/finance_server/db/transactions.py` | Link-CRUD, Invarianten, `refund_total`-Recalc, DTO `refund_links`/`refund_attributed` |
| `backend/finance_server/models/transaction.py` | Request-Modell `RefundLinkCreateRequest` |
| `backend/finance_server/services/transaction_service.py` | Thin Service-Methoden |
| `backend/finance_server/api/transactions.py` | `POST …/refund-links`, `DELETE …/refund-links/{id}` |
| `backend/finance_server/db/__init__.py` | Exporte anpassen |
| `backend/finance_server/db/sync.py` | `refund_ref_transaction_id` aus `VALID_SYNC_COLUMNS` entfernen |
| `backend/finance_server/db/analytics.py` | Einnahme-CASE auf `refund_links`-Subquery |
| `backend/finance_server/services/allocation_service.py` | Einnahme-CASE + `_detect_income`-Filter |
| `backend/finance_server/services/subscription_service.py` | Refund-Aggregation über `refund_links` |
| `backend/tests/test_schema.py` | Migration-Test |
| `backend/tests/test_refund_links.py` | Link-CRUD, Invarianten, Analytics (neu) |
| `backend/tests/test_budgets.py` | Über-Refund-Test ersetzen |
| `frontend/src/types/transaction.ts` | `RefundLink`, `refundLinks`, `refundAttributed` |
| `frontend/src/lib/mappers.ts` | DTO → Typ |
| `frontend/src/lib/transactions.ts` | `addRefundLink`/`removeRefundLink` |
| `frontend/src/pages/transactions/hooks/use-transaction-derivations.ts` | Ableitungen aus `refundLinks` |
| `frontend/src/pages/transactions/components/refund-section.tsx` | Incoming/Outgoing-UX |
| `frontend/src/hooks/use-finance-data.ts`, `use-categories.ts`, `use-partner-analytics.ts` | `isRefund → 0` → `wert − refundAttributed` |

---

### Task 1: Datenbank-Schema — `refund_links` + Migration

**Files:**
- Modify: `backend/finance_server/core/schema.py`
- Test: `backend/tests/test_schema.py`

**Interfaces:**
- Consumes: `initialize_database(connection)` (bestehend).
- Produces: `create_refund_links_table(connection)`, `migrate_refund_links(connection)`; Tabelle `refund_links(id, refund_transaction_id, expense_transaction_id, amount, created_at)`.

- [ ] **Step 1: Failing Tests schreiben**

Füge in `backend/tests/test_schema.py` hinzu:

```python
def test_initialize_database_migrates_legacy_refund_links():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE umsaetze (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_iban TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT,
            entry_date TEXT,
            created_at TEXT,
            transaction_hash TEXT NOT NULL UNIQUE,
            refund_ref_transaction_id INTEGER,
            refund_total REAL NOT NULL DEFAULT 0
        );
        """
    )
    conn.execute(
        "INSERT INTO umsaetze (account_iban, amount, date, entry_date, created_at, transaction_hash, refund_ref_transaction_id) "
        "VALUES ('DE1', 50.0, '2026-07-01', '2026-07-01', '2026-07-01T10:00:00', 'h-ref', NULL)"
    )
    conn.execute(
        "INSERT INTO umsaetze (account_iban, amount, date, entry_date, created_at, transaction_hash, refund_ref_transaction_id) "
        "VALUES ('DE1', -30.0, '2026-07-02', '2026-07-02', '2026-07-02T10:00:00', 'h-exp', 1)"
    )
    initialize_database(conn)

    cols = {row[1] for row in conn.execute("PRAGMA table_info(umsaetze)")}
    assert "refund_ref_transaction_id" not in cols
    link = conn.execute("SELECT * FROM refund_links").fetchone()
    assert link["refund_transaction_id"] == 1
    assert link["expense_transaction_id"] == 2
    assert link["amount"] == 50.0
    exp_total = conn.execute("SELECT refund_total FROM umsaetze WHERE id = 2").fetchone()["refund_total"]
    assert exp_total == 50.0
    conn.close()


def test_initialize_database_creates_refund_links_table():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_database(conn)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(refund_links)")}
    assert {"id", "refund_transaction_id", "expense_transaction_id", "amount", "created_at"} <= cols
    assert "refund_ref_transaction_id" not in {row[1] for row in conn.execute("PRAGMA table_info(umsaetze)")}
    conn.close()
```

- [ ] **Step 2: Tests laufen lassen — erwartet FAIL**

```bash
cd backend && .venv/bin/python -m pytest tests/test_schema.py -q
```
Erwartet: `FAILED` (Tabelle fehlt bzw. Spalte existiert noch).

- [ ] **Step 3: Implementierung**

In `backend/finance_server/core/schema.py` nach `create_umsaetze_table` einfügen:

```python
def create_refund_links_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS refund_links (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            refund_transaction_id INTEGER NOT NULL,
            expense_transaction_id INTEGER NOT NULL,
            amount                REAL NOT NULL CHECK (amount > 0),
            created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_refund_links_refund ON refund_links(refund_transaction_id)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_refund_links_expense ON refund_links(expense_transaction_id)"
    )


def migrate_refund_links(connection: sqlite3.Connection) -> None:
    cols = {row[1] for row in connection.execute("PRAGMA table_info(umsaetze)").fetchall()}
    if "refund_ref_transaction_id" in cols:
        connection.execute(
            """
            INSERT INTO refund_links (refund_transaction_id, expense_transaction_id, amount, created_at)
            SELECT id, refund_ref_transaction_id, amount, created_at
            FROM umsaetze
            WHERE refund_ref_transaction_id IS NOT NULL AND amount > 0
            """
        )
        connection.execute("ALTER TABLE umsaetze DROP COLUMN refund_ref_transaction_id")
    connection.execute(
        """
        UPDATE umsaetze SET refund_total = (
            SELECT COALESCE(SUM(amount), 0)
            FROM refund_links
            WHERE expense_transaction_id = umsaetze.id
        ) WHERE amount < 0
        """
    )
```

In `initialize_database` (Zeilen ~500-522) den Block

```python
    _ensure_table_columns(
        connection,
        "umsaetze",
        {
            "refund_ref_transaction_id": "INTEGER",
        },
    )
```

und den Block

```python
    connection.execute("""
        UPDATE umsaetze SET refund_total = (
            SELECT COALESCE(SUM(r.amount), 0)
            FROM umsaetze r
            WHERE r.refund_ref_transaction_id = umsaetze.id AND r.amount > 0
        ) WHERE amount < 0
    """)
```

**ersetzen** durch:

```python
    _ensure_table_columns(
        connection,
        "umsaetze",
        {
            "refund_total": "REAL NOT NULL DEFAULT 0",
        },
    )

    create_refund_links_table(connection)
    migrate_refund_links(connection)
```

(Der `_ensure_table_columns(refund_ref_transaction_id)`-Block **entfällt komplett**; der `refund_total`-`_ensure_table_columns`-Block, der direkt darunter steht (Zeilen 508-514), bleibt bestehen und wird oberhalb der neuen Zeilen eingefügt.)

- [ ] **Step 4: Tests laufen lassen — erwartet PASS**

```bash
cd backend && .venv/bin/python -m pytest tests/test_schema.py -q
```
Erwartet: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/core/schema.py backend/tests/test_schema.py
git commit -m "feat(refunds): add refund_links table and migrate legacy refund link column"
```

---

### Task 2: Backend-Link-CRUD mit Invarianten

**Files:**
- Modify: `backend/finance_server/db/transactions.py`
- Test: `backend/tests/test_refund_links.py` (Create)

**Interfaces:**
- Consumes: `get_connection`, `_log` (bestehend).
- Produces: `_refund_links_map(connection) -> dict[int, list[dict]]`, `add_refund_link(refund_transaction_id: int, expense_transaction_id: int, amount: float) -> dict | None`, `delete_refund_link(link_id: int) -> bool`, `_recalc_refund_total(tx_id: int, connection)`.

- [ ] **Step 1: Failing Tests schreiben**

Erstelle `backend/tests/test_refund_links.py`:

```python
from __future__ import annotations

import pytest
from unittest.mock import patch

from finance_server.db.transactions import add_refund_link, delete_refund_link


def _ins(conn, amount: float, hash_suffix: str) -> int:
    cursor = conn.execute(
        "INSERT INTO umsaetze (account_iban, amount, date, entry_date, created_at, transaction_hash) "
        "VALUES ('DE1', ?, '2026-07-15', '2026-07-15', '2026-07-15T10:00:00', ?)",
        (amount, f"h-{hash_suffix}"),
    )
    return cursor.lastrowid


def _run(conn, fn):
    with patch("finance_server.db.transactions.get_connection", return_value=conn), \
         patch("finance_server.db.transactions._log"):
        return fn()


class TestAddRefundLink:
    def test_add_link_sets_refund_total(self, test_db):
        income = _ins(test_db, 90.0, "inc")
        exp1 = _ins(test_db, -30.0, "exp1")
        exp2 = _ins(test_db, -40.0, "exp2")
        exp3 = _ins(test_db, -10.0, "exp3")

        _run(test_db, lambda: add_refund_link(income, exp1, 30.0))
        _run(test_db, lambda: add_refund_link(income, exp2, 40.0))
        _run(test_db, lambda: add_refund_link(income, exp3, 10.0))

        totals = {
            row["id"]: row["refund_total"]
            for row in test_db.execute("SELECT id, refund_total FROM umsaetze").fetchall()
        }
        assert totals[exp1] == 30.0
        assert totals[exp2] == 40.0
        assert totals[exp3] == 10.0
        assert test_db.execute("SELECT COUNT(*) FROM refund_links").fetchone()[0] == 3

    def test_rejects_over_attribution_of_income(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        exp1 = _ins(test_db, -30.0, "exp1")
        exp2 = _ins(test_db, -30.0, "exp2")
        _run(test_db, lambda: add_refund_link(income, exp1, 30.0))

        with pytest.raises(ValueError, match="nicht über 0"):
            _run(test_db, lambda: add_refund_link(income, exp2, 25.0))

    def test_rejects_over_refund_of_expense(self, test_db):
        income1 = _ins(test_db, 20.0, "inc1")
        income2 = _ins(test_db, 20.0, "inc2")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income1, expense, 20.0))

        with pytest.raises(ValueError, match="nicht unter 0"):
            _run(test_db, lambda: add_refund_link(income2, expense, 15.0))

    def test_rejects_non_positive_amount(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        with pytest.raises(ValueError, match="positiv"):
            _run(test_db, lambda: add_refund_link(income, expense, 0.0))

    def test_rejects_duplicate_pair(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income, expense, 20.0))
        with pytest.raises(ValueError, match="bereits verknüpft"):
            _run(test_db, lambda: add_refund_link(income, expense, 10.0))

    def test_missing_transaction_returns_none(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        assert _run(test_db, lambda: add_refund_link(999, expense, 10.0)) is None
        assert _run(test_db, lambda: add_refund_link(income, 999, 10.0)) is None


class TestDeleteRefundLink:
    def test_delete_recalculates_refund_total(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        link = _run(test_db, lambda: add_refund_link(income, expense, 20.0))
        assert test_db.execute("SELECT refund_total FROM umsaetze WHERE id = ?", (expense,)).fetchone()[0] == 20.0

        assert _run(test_db, lambda: delete_refund_link(link["id"])) is True

        assert test_db.execute("SELECT refund_total FROM umsaetze WHERE id = ?", (expense,)).fetchone()[0] == 0.0
        assert test_db.execute("SELECT COUNT(*) FROM refund_links").fetchone()[0] == 0

    def test_delete_missing_returns_false(self, test_db):
        assert _run(test_db, lambda: delete_refund_link(999)) is False
```

- [ ] **Step 2: Tests laufen lassen — erwartet FAIL**

```bash
cd backend && .venv/bin/python -m pytest tests/test_refund_links.py -q
```
Erwartet: `FAILED` (Importfehler `add_refund_link`).

- [ ] **Step 3: Implementierung**

In `backend/finance_server/db/transactions.py`:

- `_recalc_refund_total` ersetzen (Zeilen 359-367):

```python
def _recalc_refund_total(tx_id: int, connection: sqlite3.Connection) -> None:
    connection.execute(
        """UPDATE umsaetze SET refund_total = (
            SELECT COALESCE(SUM(amount), 0)
            FROM refund_links
            WHERE expense_transaction_id = umsaetze.id
        ) WHERE id = ?""",
        (tx_id,),
    )
```

- `update_transaction_refund_link` (Zeilen 370-389) **ersetzen** durch:

```python
def _transaction_amount(tx_id: int, connection: sqlite3.Connection) -> float | None:
    row = connection.execute("SELECT amount FROM umsaetze WHERE id = ?", (tx_id,)).fetchone()
    return row["amount"] if row else None


def add_refund_link(
    refund_transaction_id: int, expense_transaction_id: int, amount: float
) -> dict[str, Any] | None:
    with get_connection() as connection:
        refund_amt = _transaction_amount(refund_transaction_id, connection)
        expense_amt = _transaction_amount(expense_transaction_id, connection)
        if refund_amt is None or expense_amt is None:
            return None
        if refund_amt <= 0 or expense_amt >= 0:
            raise ValueError("Einnahme und Ausgabe erforderlich")
        if amount <= 0:
            raise ValueError("Betrag muss positiv sein")

        attributed = connection.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM refund_links WHERE refund_transaction_id = ?",
            (refund_transaction_id,),
        ).fetchone()[0]
        if attributed + amount > refund_amt + 1e-9:
            raise ValueError("Einnahme darf nicht über 0 aufgeteilt werden")

        refunded = connection.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM refund_links WHERE expense_transaction_id = ?",
            (expense_transaction_id,),
        ).fetchone()[0]
        if refunded + amount > abs(expense_amt) + 1e-9:
            raise ValueError("Ausgabe darf nicht unter 0 erstattet werden")

        duplicate = connection.execute(
            "SELECT 1 FROM refund_links WHERE refund_transaction_id = ? AND expense_transaction_id = ?",
            (refund_transaction_id, expense_transaction_id),
        ).fetchone()
        if duplicate:
            raise ValueError("Rückerstattung bereits verknüpft")

        cursor = connection.execute(
            """INSERT INTO refund_links
               (refund_transaction_id, expense_transaction_id, amount, created_at)
               VALUES (?, ?, ?, ?)""",
            (
                refund_transaction_id,
                expense_transaction_id,
                round(amount, 2),
                datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            ),
        )
        link_id = cursor.lastrowid
        link = {
            "id": link_id,
            "refund_transaction_id": refund_transaction_id,
            "expense_transaction_id": expense_transaction_id,
            "amount": round(amount, 2),
        }
        _log(
            "refund_links", link_id, "INSERT",
            {"id": link_id, "refund_transaction_id": refund_transaction_id, "expense_transaction_id": expense_transaction_id, "amount": round(amount, 2)},
            connection=connection,
        )
        _recalc_refund_total(expense_transaction_id, connection)
        return link


def delete_refund_link(link_id: int) -> bool:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT refund_transaction_id, expense_transaction_id FROM refund_links WHERE id = ?",
            (link_id,),
        ).fetchone()
        if row is None:
            return False
        cursor = connection.execute("DELETE FROM refund_links WHERE id = ?", (link_id,))
        _log("refund_links", link_id, "DELETE", connection=connection)
        _recalc_refund_total(row["expense_transaction_id"], connection)
        return cursor.rowcount > 0
```

Hinweis: `datetime` und `timezone` sind oben in `db/transactions.py` bereits importiert.

- [ ] **Step 4: Tests laufen lassen — erwartet PASS**

```bash
cd backend && .venv/bin/python -m pytest tests/test_refund_links.py -q
```
Erwartet: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/db/transactions.py backend/tests/test_refund_links.py
git commit -m "feat(refunds): add/delete refund links with income and expense invariants"
```

---

### Task 3: Löschen-Aufräumen + DTO `refund_links`/`refund_attributed`

**Files:**
- Modify: `backend/finance_server/db/transactions.py`
- Test: `backend/tests/test_refund_links.py`

**Interfaces:**
- Consumes: `_recalc_refund_total`, `row_to_dict` (bestehend).
- Produces: `row_to_dict(row, refund_links=None)` liefert `refund_links`-Liste, `refund_attributed`, `is_refund`; `fetch_transactions`/`fetch_latest_transaction` hängen Links an.

- [ ] **Step 1: Failing Tests schreiben**

An `backend/tests/test_refund_links.py` anhängen:

```python
from finance_server.db.transactions import delete_transaction, fetch_latest_transaction, fetch_transactions


class TestDeleteCleanup:
    def test_delete_income_removes_links_and_recalcs(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income, expense, 20.0))

        assert _run(test_db, lambda: delete_transaction(income)) is True

        assert test_db.execute("SELECT COUNT(*) FROM refund_links").fetchone()[0] == 0
        assert test_db.execute("SELECT refund_total FROM umsaetze WHERE id = ?", (expense,)).fetchone()[0] == 0.0

    def test_delete_expense_removes_its_links(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income, expense, 20.0))

        assert _run(test_db, lambda: delete_transaction(expense)) is True

        assert test_db.execute("SELECT COUNT(*) FROM refund_links").fetchone()[0] == 0


class TestDto:
    def test_fetch_transactions_includes_links_and_attributed(self, test_db):
        income = _ins(test_db, 90.0, "inc")
        exp1 = _ins(test_db, -30.0, "exp1")
        exp2 = _ins(test_db, -40.0, "exp2")
        _run(test_db, lambda: add_refund_link(income, exp1, 30.0))
        _run(test_db, lambda: add_refund_link(income, exp2, 40.0))

        with patch("finance_server.db.transactions.get_connection", return_value=test_db):
            rows = fetch_transactions(days=36500)
        income_dto = next(r for r in rows if r["id"] == income)

        assert income_dto["refund_links"] == [
            {"id": 1, "refund_transaction_id": income, "expense_transaction_id": exp1, "amount": 30.0},
            {"id": 2, "refund_transaction_id": income, "expense_transaction_id": exp2, "amount": 40.0},
        ]
        assert income_dto["refund_attributed"] == 70.0
        assert income_dto["is_refund"] is True
        assert next(r for r in rows if r["id"] == exp1)["is_refund"] is False

    def test_fetch_latest_transaction_includes_links(self, test_db):
        income = _ins(test_db, 50.0, "inc")
        expense = _ins(test_db, -30.0, "exp")
        _run(test_db, lambda: add_refund_link(income, expense, 20.0))

        with patch("finance_server.db.transactions.get_connection", return_value=test_db):
            latest = fetch_latest_transaction(iban="DE1")
        assert latest["id"] == expense
        assert latest["refund_links"] == []
```

- [ ] **Step 2: Tests laufen lassen — erwartet FAIL**

```bash
cd backend && .venv/bin/python -m pytest tests/test_refund_links.py -q
```
Erwartet: `FAILED` (KeyError `refund_links` / `refund_attributed`).

- [ ] **Step 3: Implementierung**

In `backend/finance_server/db/transactions.py`:

a) Neue Hilfsfunktion vor `row_to_dict` einfügen:

```python
def _refund_links_map(connection: sqlite3.Connection) -> dict[int, list[dict[str, Any]]]:
    rows = connection.execute(
        """SELECT id, refund_transaction_id, expense_transaction_id, amount
           FROM refund_links ORDER BY id"""
    ).fetchall()
    links_map: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        links_map.setdefault(row["refund_transaction_id"], []).append(
            {
                "id": row["id"],
                "refund_transaction_id": row["refund_transaction_id"],
                "expense_transaction_id": row["expense_transaction_id"],
                "amount": row["amount"],
            }
        )
    return links_map
```

b) `row_to_dict` (Zeile 145) Signatur ändern und die drei Refund-Felder ersetzen:

```python
def row_to_dict(
    row: sqlite3.Row, refund_links: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    links = refund_links or []
    return {
        ...
        "refund_links": links,
        "refund_attributed": round(sum(l["amount"] for l in links), 2),
        "refund_total": row["refund_total"],
        "is_refund": row["amount"] > 0 and len(links) > 0,
    }
```

Ersetze dabei die bisherigen Zeilen:
```python
        "refund_ref_transaction_id": row["refund_ref_transaction_id"],
        "refund_total": row["refund_total"],
        "is_refund": row["refund_ref_transaction_id"] is not None and row["amount"] > 0,
```

c) `fetch_transactions` (Zeilen 248-251) ersetzen:

```python
    with get_connection() as connection:
        rows = connection.execute("\n".join(query_parts), params).fetchall()
        links_map = _refund_links_map(connection)

    return [row_to_dict(row, links_map.get(row["id"])) for row in rows]
```

d) `fetch_latest_transaction` (Zeilen 271-273) ersetzen:

```python
    with get_connection() as connection:
        row = connection.execute("\n".join(query_parts), params).fetchone()
        links_map = _refund_links_map(connection)
    return row_to_dict(row, links_map.get(row["id"])) if row else None
```

e) `delete_transaction` (Zeilen 296-308) ersetzen:

```python
def delete_transaction(transaction_id: int) -> bool:
    with get_connection() as connection:
        expense_ids = [
            r["expense_transaction_id"]
            for r in connection.execute(
                "SELECT expense_transaction_id FROM refund_links WHERE refund_transaction_id = ?",
                (transaction_id,),
            ).fetchall()
        ]
        connection.execute(
            "DELETE FROM refund_links WHERE refund_transaction_id = ? OR expense_transaction_id = ?",
            (transaction_id, transaction_id),
        )
        for expense_id in set(expense_ids):
            if expense_id != transaction_id:
                _recalc_refund_total(expense_id, connection)
        cursor = connection.execute("DELETE FROM umsaetze WHERE id = ?", (transaction_id,))
        result = cursor.rowcount > 0
        _log("umsaetze", transaction_id, "DELETE", connection=connection)
        return result
```

f) `delete_transactions_batch` (Zeilen 311-329) ersetzen:

```python
def delete_transactions_batch(transaction_ids: list[int]) -> int:
    if not transaction_ids:
        return 0
    placeholders = ",".join("?" for _ in transaction_ids)
    with get_connection() as connection:
        expense_ids = [
            r["expense_transaction_id"]
            for r in connection.execute(
                f"SELECT expense_transaction_id FROM refund_links WHERE refund_transaction_id IN ({placeholders})",
                transaction_ids,
            ).fetchall()
        ]
        connection.execute(
            f"DELETE FROM refund_links WHERE refund_transaction_id IN ({placeholders}) OR expense_transaction_id IN ({placeholders})",
            transaction_ids + transaction_ids,
        )
        cursor = connection.execute(
            f"DELETE FROM umsaetze WHERE id IN ({placeholders})",
            transaction_ids,
        )
        result = cursor.rowcount
        for tid in transaction_ids:
            _log("umsaetze", tid, "DELETE", connection=connection)
        for expense_id in set(expense_ids):
            if expense_id not in transaction_ids:
                _recalc_refund_total(expense_id, connection)
        return result
```

- [ ] **Step 4: Tests laufen lassen — erwartet PASS**

```bash
cd backend && .venv/bin/python -m pytest tests/test_refund_links.py -q
```
Erwartet: `13 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/db/transactions.py backend/tests/test_refund_links.py
git commit -m "feat(refunds): expose refund links in transaction DTO and clean up on delete"
```

---

### Task 4: API, Models, Service, Exporte

**Files:**
- Modify: `backend/finance_server/models/transaction.py`
- Modify: `backend/finance_server/services/transaction_service.py`
- Modify: `backend/finance_server/api/transactions.py`
- Modify: `backend/finance_server/db/__init__.py`

**Interfaces:**
- Consumes: `add_refund_link`, `delete_refund_link` (Task 2).
- Produces: `POST /db/transactions/{id}/refund-links`, `DELETE /db/transactions/{id}/refund-links/{link_id}`.

- [ ] **Step 1: Tests schreiben** — API ist dünn; Verhalten wird über Task 2/3 abgedeckt. Dieser Task hat keinen separaten Testlauf (Service-Aufruf ist schon getestet).

- [ ] **Step 2: Implementierung**

`backend/finance_server/models/transaction.py` — `TransactionRefundLinkUpdateRequest` ersetzen:

```python
class RefundLinkCreateRequest(BaseModel):
    expense_transaction_id: int
    amount: float
```

`backend/finance_server/services/transaction_service.py` — `update_refund_link` (Zeilen 54-58) ersetzen:

```python
    def add_refund_link(
        self, refund_transaction_id: int, expense_transaction_id: int, amount: float
    ) -> dict[str, Any] | None:
        return add_refund_link(refund_transaction_id, expense_transaction_id, amount)

    def delete_refund_link(self, link_id: int) -> bool:
        return delete_refund_link(link_id)
```

Und den Import oben anpassen (Zeile 12): `update_transaction_refund_link` → `add_refund_link, delete_refund_link`.

`backend/finance_server/api/transactions.py`:

- Import (Zeile 7): `TransactionRefundLinkUpdateRequest` → `RefundLinkCreateRequest`.
- Endpoint `set_transaction_refund_link` (Zeilen 91-104) **ersetzen**:

```python
@router.post("/db/transactions/{transaction_id}/refund-links")
def create_refund_link(
    transaction_id: int,
    request: RefundLinkCreateRequest,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    try:
        link = service.add_refund_link(transaction_id, request.expense_transaction_id, request.amount)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if link is None:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")
    return {"link": link}


@router.delete("/db/transactions/{transaction_id}/refund-links/{link_id}")
def remove_refund_link(
    transaction_id: int,
    link_id: int,
    service: TransactionService = Depends(get_transaction_service),
) -> dict[str, Any]:
    deleted = service.delete_refund_link(link_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rückerstattung nicht gefunden")
    return {"deleted": link_id}
```

`backend/finance_server/db/__init__.py` — Import (Zeile 53): `update_transaction_refund_link` → `add_refund_link, delete_refund_link`; in `__all__` (Zeile 107): `"update_transaction_refund_link"` → `"add_refund_link"`, `"delete_refund_link"` (alphabetisch einsortieren).

- [ ] **Step 3: Verifikation** — Backend importiert sauber und Suite grün:

```bash
cd backend && .venv/bin/python -m pytest tests/test_refund_links.py tests/test_budgets.py tests/test_allocation_service.py tests/test_schema.py -q
```
Erwartet: alle Tests grün.

- [ ] **Step 4: Commit**

```bash
git add backend/finance_server/models/transaction.py backend/finance_server/services/transaction_service.py backend/finance_server/api/transactions.py backend/finance_server/db/__init__.py
git commit -m "feat(refunds): add refund-links API endpoints"
```

---

### Task 5: Sync-Spalten-Set bereinigen

**Files:**
- Modify: `backend/finance_server/db/sync.py`

**Interfaces:** Keine.

- [ ] **Step 1: Implementierung**

In `backend/finance_server/db/sync.py`, Zeile 102, `"kategorie", "note", "splits", "refund_ref_transaction_id",` → `"kategorie", "note", "splits",`.

- [ ] **Step 2: Verifikation**

```bash
cd backend && .venv/bin/python -m pytest tests/test_sync_apply.py tests/test_sync_crypto.py -q
```
Erwartet: grün.

- [ ] **Step 3: Commit**

```bash
git add backend/finance_server/db/sync.py
git commit -m "chore(refunds): drop refund_ref_transaction_id from sync columns"
```

---

### Task 6: Reporting auf `refund_links` umstellen

**Files:**
- Modify: `backend/finance_server/db/analytics.py`
- Modify: `backend/finance_server/services/allocation_service.py`
- Modify: `backend/finance_server/services/subscription_service.py`
- Test: `backend/tests/test_refund_links.py`

**Interfaces:**
- Consumes: Tabelle `refund_links` (Task 1).
- Produces: Einnahmen = `Betrag − aufgeteilt`; Ausgaben = `ABS(Betrag) − refund_total` in allen Auswertungen.

- [ ] **Step 1: Failing Tests schreiben**

An `backend/tests/test_refund_links.py` anhängen:

```python
from finance_server.db.analytics import fetch_summary


class TestAnalytics:
    def _summary(self, conn):
        with patch("finance_server.db.analytics.get_connection", return_value=conn):
            return fetch_summary(days=36500)

    def test_partial_refund_keeps_remaining_expense(self, test_db):
        income = _ins(test_db, 75.0, "inc")
        e1 = _ins(test_db, -30.0, "e1")
        e2 = _ins(test_db, -40.0, "e2")
        e3 = _ins(test_db, -10.0, "e3")
        _run(test_db, lambda: add_refund_link(income, e1, 30.0))
        _run(test_db, lambda: add_refund_link(income, e2, 40.0))
        _run(test_db, lambda: add_refund_link(income, e3, 5.0))

        summary = self._summary(test_db)

        assert summary["incomes"] == 0.0
        assert summary["expenses"] == 5.0

    def test_remaining_income_counts_as_income(self, test_db):
        income = _ins(test_db, 90.0, "inc")
        e1 = _ins(test_db, -30.0, "e1")
        e2 = _ins(test_db, -40.0, "e2")
        e3 = _ins(test_db, -10.0, "e3")
        _run(test_db, lambda: add_refund_link(income, e1, 30.0))
        _run(test_db, lambda: add_refund_link(income, e2, 40.0))
        _run(test_db, lambda: add_refund_link(income, e3, 10.0))

        summary = self._summary(test_db)

        assert summary["incomes"] == 10.0
        assert summary["expenses"] == 0.0
```

- [ ] **Step 2: Tests laufen lassen — erwartet FAIL**

```bash
cd backend && .venv/bin/python -m pytest tests/test_refund_links.py -q
```
Erwartet: `FAILED` (Analytics zählt Einnahmen noch falsch — nicht 0 bzw. nicht 10).

- [ ] **Step 3: Implementierung**

`backend/finance_server/db/analytics.py`:

- Zeile 44 (fetch_summary):
```sql
                COALESCE(SUM(CASE WHEN amount > 0 AND refund_ref_transaction_id IS NULL THEN amount ELSE 0 END), 0) AS incomes,
```
→
```sql
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount - COALESCE((SELECT SUM(amount) FROM refund_links rl WHERE rl.refund_transaction_id = umsaetze.id), 0) ELSE 0 END), 0) AS incomes,
```

- Zeilen 140, 158, 170 (fetch_category_analytics, mit `u.`-Alias):
```sql
                    WHEN u.amount > 0 AND u.refund_ref_transaction_id IS NOT NULL THEN 0
```
→
```sql
                    WHEN u.amount > 0 THEN u.amount - COALESCE((SELECT SUM(amount) FROM refund_links rl WHERE rl.refund_transaction_id = u.id), 0)
```

- Zeilen 231, 242 (fetch_partner_analytics, ohne Alias):
```sql
                        WHEN amount > 0 AND refund_ref_transaction_id IS NOT NULL THEN 0
```
→
```sql
                        WHEN amount > 0 THEN amount - COALESCE((SELECT SUM(amount) FROM refund_links rl WHERE rl.refund_transaction_id = umsaetze.id), 0)
```

Die Ausgabe-Zweige (`amount < 0 THEN … refund_total`) bleiben unverändert.

`backend/finance_server/services/allocation_service.py`:

- Zeile ~187:
```sql
                                WHEN amount > 0 AND refund_ref_transaction_id IS NOT NULL THEN 0
```
→
```sql
                                WHEN amount > 0 THEN amount - COALESCE((SELECT SUM(amount) FROM refund_links rl WHERE rl.refund_transaction_id = umsaetze.id), 0)
```

- Zeile ~351:
```sql
                     AND refund_ref_transaction_id IS NULL
```
→
```sql
                     AND NOT EXISTS (SELECT 1 FROM refund_links rl WHERE rl.refund_transaction_id = umsaetze.id)
```

`backend/finance_server/services/subscription_service.py`, Block Zeilen 482-491:

```python
                refund_rows = connection.execute(
                    f"""
                    SELECT rl.expense_transaction_id AS expense_id, SUM(rl.amount) AS refund_total
                    FROM refund_links rl
                    WHERE rl.expense_transaction_id IN ({placeholders})
                    GROUP BY rl.expense_transaction_id
                    """,
                    all_tx_ids,
                ).fetchall()
            refund_map = {row["expense_id"]: float(row["refund_total"]) for row in refund_rows}
```

(Der Rest des Blocks ab Zeile 495 bleibt unverändert; er liest `refund_map` über `tx["id"]`, also die Ausgaben-ID.)

- [ ] **Step 4: Tests laufen lassen — erwartet PASS**

```bash
cd backend && .venv/bin/python -m pytest tests/test_refund_links.py tests/test_allocation_service.py tests/test_budgets.py -q
```
Erwartet: grün.

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/db/analytics.py backend/finance_server/services/allocation_service.py backend/finance_server/services/subscription_service.py backend/tests/test_refund_links.py
git commit -m "feat(refunds): report partially refunded incomes and expenses"
```

---

### Task 7: Budget-Test für Über-Erstattung ersetzen

**Files:**
- Modify: `backend/tests/test_budgets.py`

**Interfaces:** Keine.

- [ ] **Step 1: Test ersetzen**

In `backend/tests/test_budgets.py` den Test `test_over_refunded_transaction_counts_as_negative_spend` (Zeilen 152-161) ersetzen durch:

```python
    def test_fully_refunded_transaction_counts_as_zero_spend(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [2], 50.0))
        _tx(conn, "2026-07", -30.0, 2, refund_total=30.0)

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert result[0]["spent"] == 0.0
        assert result[0]["remaining"] == 50.0
        assert result[0]["is_over"] is False
```

- [ ] **Step 2: Tests laufen lassen — erwartet PASS**

```bash
cd backend && .venv/bin/python -m pytest tests/test_budgets.py -q
```
Erwartet: grün.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_budgets.py
git commit -m "test(refunds): pin full-refund-to-zero budget behavior, drop over-refund case"
```

---

### Task 8: Frontend-Typen, Mapper, API-Funktionen

**Files:**
- Modify: `frontend/src/types/transaction.ts`
- Modify: `frontend/src/lib/mappers.ts`
- Modify: `frontend/src/lib/transactions.ts`

**Interfaces:**
- Consumes: Backend-DTO `refund_links`, `refund_attributed`, `is_refund`.
- Produces: `RefundLink`-Typ; `transaction.technisch.refundLinks: RefundLink[]`, `refundAttributed: number`; `addRefundLink(transactionId, expenseTransactionId, amount)`, `removeRefundLink(transactionId, linkId)`.

- [ ] **Step 1: Implementierung**

`frontend/src/types/transaction.ts` — vor der `Transaction`-Interface-Definition:

```ts
export type RefundLink = {
  id: number;
  refundTransactionId: number;
  expenseTransactionId: number;
  amount: number;
};
```

In `technisch` (Zeilen 217-218):

```ts
    refundLinks: RefundLink[];
    refundAttributed: number;
    isRefund: boolean;
```

(ersetzt `refundRefTransactionId: number | null;` + `isRefund`.)

`frontend/src/lib/mappers.ts` (Zeilen 135-136):

```ts
      refundLinks: (dto.refund_links ?? []).map((link: any) => ({
        id: link.id,
        refundTransactionId: link.refund_transaction_id,
        expenseTransactionId: link.expense_transaction_id,
        amount: link.amount,
      })),
      refundAttributed: dto.refund_attributed ?? 0,
      isRefund: !!dto.is_refund,
```

`frontend/src/lib/transactions.ts` — `updateRefundLink` (Zeilen 66-80) ersetzen:

```ts
export async function addRefundLink(
  transactionId: number,
  expenseTransactionId: number,
  amount: number,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/refund-links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expense_transaction_id: expenseTransactionId, amount }),
    },
  );

  await parseJsonResponse(response);
}

export async function removeRefundLink(
  transactionId: number,
  linkId: number,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/db/transactions/${transactionId}/refund-links/${linkId}`,
    {
      method: "DELETE",
    },
  );

  await parseJsonResponse(response);
}
```

- [ ] **Step 2: Verifikation**

```bash
pnpm --dir frontend exec tsc --noEmit
```
Erwartet: Fehler nur noch in `refund-section.tsx` und `use-transaction-derivations.ts` (werden in Task 9/10 behoben). Falls zusätzliche Stellen `refundRefTransactionId` nutzen, dort ebenfalls auf `refundLinks` umstellen und im Task 9/10 aufnehmen.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/transaction.ts frontend/src/lib/mappers.ts frontend/src/lib/transactions.ts
git commit -m "feat(refunds): frontend types, mapper and refund-link API client"
```

---

### Task 9: Ableitungen im Frontend-Hook

**Files:**
- Modify: `frontend/src/pages/transactions/hooks/use-transaction-derivations.ts`
- Modify: `frontend/src/hooks/use-finance-data.ts`
- Modify: `frontend/src/hooks/use-categories.ts`
- Modify: `frontend/src/hooks/use-partner-analytics.ts`

**Interfaces:**
- Consumes: `transaction.technisch.refundLinks`, `refundAttributed` (Task 8).
- Produces: `isRefund`, `linkedRefundTotal`, `refundRemaining`, `showRefundSection`, `displayAmount` aus Links.

- [ ] **Step 1: Implementierung**

`frontend/src/pages/transactions/hooks/use-transaction-derivations.ts`:

```ts
  const isRefund =
    transaction.betrag.wert > 0 && transaction.technisch.refundLinks.length > 0;

  const linkedRefundTotal = useMemo(() => {
    if (transaction.betrag.wert >= 0) return 0;
    return allTransactions.reduce(
      (sum, t) =>
        sum +
        t.technisch.refundLinks
          .filter((link) => link.expenseTransactionId === transaction.id)
          .reduce((s, link) => s + link.amount, 0),
      0,
    );
  }, [transaction, allTransactions]);

  const refundRemaining = useMemo(
    () =>
      Math.max(0, transaction.betrag.wert - transaction.technisch.refundAttributed),
    [transaction.betrag.wert, transaction.technisch.refundAttributed],
  );

  const hasRefunds = linkedRefundTotal > 0;

  const displayAmount = useMemo(() => {
    if (isRefund) return refundRemaining;
    if (hasRefunds) return Math.min(0, transaction.betrag.wert + linkedRefundTotal);
    return transaction.betrag.wert;
  }, [transaction.betrag.wert, linkedRefundTotal, isRefund, hasRefunds, refundRemaining]);

  const showRefundSection =
    transaction.betrag.wert > 0 ||
    (transaction.betrag.wert < 0 &&
      allTransactions.some((t) =>
        t.technisch.refundLinks.some((link) => link.expenseTransactionId === transaction.id),
      ));
```

Die `linkedOriginalAmount`-Memo (Zeilen 30-36) komplett entfernen; im Rückgabeobjekt (Zeilen 88-105) `linkedOriginalAmount` entfernen und `refundRemaining` behalten. `displayAmount`-Abhängigkeit enthält `refundRemaining` (siehe oben).

`frontend/src/hooks/use-finance-data.ts`, `calculateIncomes` (Zeilen 36-41):

```ts
function calculateIncomes(transactions: Transaction[]) {
  return transactions.reduce(
    (total, t) =>
      t.betrag.wert > 0
        ? total + t.betrag.wert - t.technisch.refundAttributed
        : total,
    0,
  );
}
```

`frontend/src/hooks/use-categories.ts` (Zeilen 72-77):

```ts
      let effective = t.betrag.wert;
      if (t.betrag.wert < 0) {
        effective = t.betrag.wert + t.betrag.refundTotal;
      } else if (t.betrag.wert > 0) {
        effective = t.betrag.wert - t.technisch.refundAttributed;
      }
```

`frontend/src/hooks/use-partner-analytics.ts` (Zeilen 30-35):

```ts
      let effective = t.betrag.wert;
      if (t.betrag.wert < 0) {
        effective = t.betrag.wert + t.betrag.refundTotal;
      } else if (t.betrag.wert > 0) {
        effective = t.betrag.wert - t.technisch.refundAttributed;
      }
```

- [ ] **Step 2: Verifikation**

```bash
pnpm --dir frontend exec tsc --noEmit
```
Erwartet: Fehler nur noch in `refund-section.tsx` (wird in Task 10 behoben).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/transactions/hooks/use-transaction-derivations.ts frontend/src/hooks/use-finance-data.ts frontend/src/hooks/use-categories.ts frontend/src/hooks/use-partner-analytics.ts
git commit -m "feat(refunds): derive refund state from refund links in frontend hooks"
```

---

### Task 10: Refund-Section (Incoming + Outgoing) umbauen

**Files:**
- Modify: `frontend/src/pages/transactions/components/refund-section.tsx`

**Interfaces:**
- Consumes: `addRefundLink`, `removeRefundLink` (Task 8); `transaction.technisch.refundLinks`/`refundAttributed`; `Transaction`-Typ.
- Produces: Incoming = Link-Liste + Betragseingabe + "Rest"-Anzeige, Add-Button nur wenn `Rest > 0`; Outgoing = Link-Beträge statt Vollbeträge.

- [ ] **Step 1: Implementierung**

`frontend/src/pages/transactions/components/refund-section.tsx` komplett ersetzen:

```tsx
import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import { BrandIcon } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, formatDate } from "@/lib/utils/format";
import { addRefundLink, removeRefundLink } from "@/lib/transactions";
import { type Transaction } from "@/types/transaction";

export function RefundSectionIncoming({
  transaction,
  allTransactions,
  onRefundLinkChange,
}: {
  transaction: Transaction;
  allTransactions: Transaction[];
  onRefundLinkChange: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Transaction | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const links = transaction.technisch.refundLinks;
  const remaining = Math.max(0, transaction.betrag.wert - transaction.technisch.refundAttributed);
  const canAdd = remaining > 0.005;

  const outgoingList = useMemo(
    () => allTransactions.filter((t) => t.betrag.wert < 0),
    [allTransactions],
  );

  const expenseRemainingFor = (expense: Transaction) => {
    const refunded = allTransactions.reduce(
      (sum, t) =>
        sum +
        t.technisch.refundLinks
          .filter((link) => link.expenseTransactionId === expense.id)
          .reduce((s, link) => s + link.amount, 0),
      0,
    );
    return Math.max(0, Math.abs(expense.betrag.wert) - refunded);
  };

  const handlePick = (expense: Transaction) => {
    setSelectedExpense(expense);
    setAmountDraft(Math.min(remaining, expenseRemainingFor(expense)).toFixed(2));
    setPickerOpen(false);
    setAmountOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedExpense) return;
    const amount = Number.parseFloat(amountDraft.replace(",", "."));
    const max = Math.min(remaining, expenseRemainingFor(selectedExpense));
    if (!Number.isFinite(amount) || amount <= 0 || amount > max + 0.005) return;
    setSubmitting(true);
    try {
      await addRefundLink(transaction.id, selectedExpense.id, amount);
      setAmountOpen(false);
      setSelectedExpense(null);
      onRefundLinkChange();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (linkId: number) => {
    setRemovingId(linkId);
    try {
      await removeRefundLink(transaction.id, linkId);
      onRefundLinkChange();
    } finally {
      setRemovingId(null);
    }
  };

  const amountValid = selectedExpense
    ? (() => {
        const amount = Number.parseFloat(amountDraft.replace(",", "."));
        const max = Math.min(remaining, expenseRemainingFor(selectedExpense));
        return Number.isFinite(amount) && amount > 0 && amount <= max + 0.005;
      })()
    : false;

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Diese Gutschrift ist eine Rückerstattung für
      </p>

      {links.length > 0 && (
        <div className="space-y-1.5">
          {links.map((link) => {
            const expense = allTransactions.find((t) => t.id === link.expenseTransactionId);
            return (
              <div
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BrandIcon
                    src={expense?.zahlungspartner.logoUrl || undefined}
                    alt={expense?.zahlungspartner.datenbankName || expense?.zahlungspartner.name || "?"}
                    sizeClassName="size-8 shrink-0"
                    backgroundClassName={
                      expense?.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                    }
                    kind={expense?.zahlungspartner.isCompany ? "company" : "person"}
                    imgNoPadding={!expense?.zahlungspartner.logoPadding}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {expense?.zahlungspartner.datenbankName ||
                        expense?.zahlungspartner.name ||
                        "–"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {expense ? formatDate(expense.daten.buchungsdatum) : "–"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium tabular-nums text-green-500">
                    +{formatAmount(link.amount, transaction.betrag.waehrung)}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={removingId !== null}
                        onClick={() => void handleRemove(link.id)}
                        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {removingId === link.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Verknüpfung entfernen</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">
          Rest: {formatAmount(remaining, transaction.betrag.waehrung)}
        </span>
        {canAdd && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="shadow-none h-9 text-muted-foreground font-normal hover:text-foreground"
          >
            <Plus className="size-3.5 shrink-0 opacity-50" />
            <span>Rückerstattung hinzufügen</span>
          </Button>
        )}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Ausgehende Zahlung auswählen</DialogTitle>
            <DialogDescription>
              Wähle die ursprüngliche Zahlung aus, auf die sich diese Rückerstattung bezieht
            </DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Nach Name, Betrag oder Datum suchen …" />
            <CommandList>
              <CommandEmpty>Keine ausgehende Zahlung gefunden</CommandEmpty>
              <CommandGroup>
                {outgoingList.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`${t.id}-${t.zahlungspartner.name || ""} ${formatAmount(Math.abs(t.betrag.wert), t.betrag.waehrung)} ${formatDate(t.daten.buchungsdatum)}`}
                    onSelect={() => handlePick(t)}
                    className="cursor-pointer"
                  >
                    <BrandIcon
                      src={t.zahlungspartner.logoUrl || undefined}
                      alt={t.zahlungspartner.datenbankName || t.zahlungspartner.name || "?"}
                      sizeClassName="size-9 shrink-0"
                      backgroundClassName={
                        t.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                      }
                      kind={t.zahlungspartner.isCompany ? "company" : "person"}
                      imgNoPadding={!t.zahlungspartner.logoPadding}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {t.zahlungspartner.datenbankName || t.zahlungspartner.name || "–"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(t.daten.buchungsdatum)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-red-500">
                      {formatAmount(Math.abs(t.betrag.wert), t.betrag.waehrung)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={amountOpen} onOpenChange={setAmountOpen}>
        <DialogContent className="p-0 gap-0 max-w-sm" showCloseButton={false}>
          <DialogHeader className="p-5 pb-2">
            <DialogTitle>Betrag der Rückerstattung</DialogTitle>
            <DialogDescription>
              Wie viel der {formatAmount(transaction.betrag.wert, transaction.betrag.waehrung)} entfällt auf{" "}
              {selectedExpense?.zahlungspartner.datenbankName || selectedExpense?.zahlungspartner.name || "diese Ausgabe"}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-5 pt-2">
            <Input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              autoFocus
            />
            {selectedExpense && (
              <p className="text-xs text-muted-foreground">
                Maximal {formatAmount(Math.min(remaining, expenseRemainingFor(selectedExpense)), transaction.betrag.waehrung)} —
                Rest der Gutschrift und Rest der Ausgabe
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAmountOpen(false)}>
                Abbrechen
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!amountValid || submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RefundSectionOutgoing({
  transaction,
  allTransactions,
  onRefundLinkChange,
}: {
  transaction: Transaction;
  allTransactions: Transaction[];
  onRefundLinkChange: () => void;
}) {
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);

  const refundLinks = useMemo(
    () =>
      allTransactions
        .flatMap((t) => t.technisch.refundLinks.map((link) => ({ ...link, income: t })))
        .filter((link) => link.expenseTransactionId === transaction.id),
    [allTransactions, transaction.id],
  );

  const handleUnlink = async (linkId: number) => {
    setUnlinkingId(linkId);
    try {
      await removeRefundLink(refundLinks.find((l) => l.id === linkId)?.income.id ?? transaction.id, linkId);
      onRefundLinkChange();
    } finally {
      setUnlinkingId(null);
    }
  };

  if (refundLinks.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Rückerstattungen für diese Ausgabe
      </p>
      <div className="space-y-1.5">
        {refundLinks.map((link) => (
          <div
            key={link.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <BrandIcon
                src={link.income.zahlungspartner.logoUrl || undefined}
                alt={link.income.zahlungspartner.datenbankName || link.income.zahlungspartner.name || "?"}
                sizeClassName="size-8 shrink-0"
                backgroundClassName={
                  link.income.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                }
                kind={link.income.zahlungspartner.isCompany ? "company" : "person"}
                imgNoPadding={!link.income.zahlungspartner.logoPadding}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {link.income.zahlungspartner.datenbankName || link.income.zahlungspartner.name || "–"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(link.income.daten.buchungsdatum)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium tabular-nums text-green-500">
                +{formatAmount(link.amount, transaction.betrag.waehrung)}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={unlinkingId !== null}
                    onClick={() => void handleUnlink(link.id)}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {unlinkingId === link.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Verknüpfung entfernen</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verifikation**

```bash
pnpm --dir frontend exec tsc --noEmit
```
Erwartet: 0 Fehler. Falls `@/components/ui/input` nicht existiert, stattdessen das bestehende Input-Muster aus dem Codebase (z. B. aus `dialog`-Nutzern) verwenden und Verifikation wiederholen.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/transactions/components/refund-section.tsx
git commit -m "feat(refunds): split refund income across multiple expenses in UI"
```

---

### Task 11: Gesamt-Verifikation

**Files:** keine Änderungen.

- [ ] **Step 1: Backend-Tests**

```bash
cd backend && .venv/bin/python -m pytest -q
```
Erwartet: alle Tests grün.

- [ ] **Step 2: Frontend-Typecheck**

```bash
pnpm --dir frontend exec tsc --noEmit
```
Erwartet: 0 Fehler.

- [ ] **Step 3: Frontend-Build**

```bash
pnpm --dir frontend build
```
Erwartet: Build erfolgreich.

- [ ] **Step 4: Manueller Smoke-Test (optional)**

App starten (`pnpm run dev`), Gutschrift öffnen, zwei Ausgaben mit Teilbeträgen verknüpfen, "Rest"-Anzeige und Button-Ausblendung bei Rest 0 prüfen; Ausgabenseite zeigt Teilbeträge.

---

## Self-Review

**Spec-Coverage:**
- `refund_links`-Tabelle + Migration + DROP COLUMN → Task 1 ✓
- Link-CRUD mit beiden Invarianten → Task 2 ✓
- `refund_total`-Cache und Recalc → Tasks 1-3 ✓
- API-Endpoints → Task 4 ✓
- Sync-Bereinigung → Task 5 ✓
- Analytics/Allocation/Subscription auf Links → Task 6 ✓
- Budget-Über-Refund-Test ersetzt → Task 7 ✓
- Frontend-Typen/Mapper/API → Task 8 ✓
- Derivationen + Analytics-Hooks → Task 9 ✓
- Incoming/Outgoing-UX mit "Rest"-Anzeige und Button-Hide → Task 10 ✓

**Platzhalter-Scan:** keine TBD/TODO; alle Schritte enthalten vollständigen Code.

**Typ-Konsistenz:** `RefundLink`-Shape (`id`, `refundTransactionId`, `expenseTransactionId`, `amount`) konsistent in Mapper, Hook und Section; Backend-Feldnamen `refund_links`, `refund_attributed`, `is_refund` konsistent in DTO und Mapper.
