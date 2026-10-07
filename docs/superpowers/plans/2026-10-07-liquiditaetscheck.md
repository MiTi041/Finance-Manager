# Liquiditätscheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Seite `/liquidity`, die anhand von Startliquidität, manuellen Ein-/Ausgaben (sicher vs. erwartet), laufenden Abos und vorgemerkten Transaktionen bis zu einem frei wählbaren Enddatum zeigt, ob man liquide bleibt und wie hoch die Differenz ist.

**Architecture:** Das Backend speichert nur die manuellen Einträge in einer neuen Tabelle `liquidity_entries` und stellt ein kleines CRUD unter `/api/db/liquidity-entries` bereit (Muster wie `budgets`). Die eigentliche Rechnung läuft im Frontend: ein Hook lädt Einträge, Kontostände, Abos und vorgemerkte Transaktionen; reine Funktionen in `utils.ts` projizieren die Auto-Quellen in den Zeitraum und berechnen Deckung/Best-Case/Differenz.

**Tech Stack:** Python 3.11 + FastAPI + SQLite (Backend), React 19 + TypeScript + Vite + Tailwind + Radix/Shadcn (`Card`, `Button`, `Input`, `Label`, `Switch`, `DatePicker`, `EmptyState`, `sonner`) (Frontend), `node --test` + `node:assert` für Frontend-Tests, `pytest` für Backend-Tests.

## Global Constraints

- Nur bei expliziter Nutzer-Freigabe committen. Solange keine Freigabe vorliegt, die `git commit`-Schritte überspringen.
- Sprache der UI-Texte und Fehlermeldungen: Deutsch (bestehende Konvention).
- Keine neuen Dependencies. Nur vorhandene Bausteine verwenden.
- Keine Kommentare im Code, außer `// ponytail:`-Marker für bewusste Vereinfachungen.
- Backend: `from __future__ import annotations` oben, 100-Zeichen-Zeilen, Doppel-Quotes (ruff).
- DB-Schema idempotent in `backend/finance_server/core/schema.py` (`CREATE TABLE IF NOT EXISTS`), Registrierung in `initialize_database`.
- Frontend-Typen für die Liquidität liegen in `frontend/src/lib/liquidity.ts`; die reine Rechenlogik in `frontend/src/pages/liquidity/utils.ts`.

---

### Task 1: Backend — Tabelle, CRUD, API, Tests

**Files:**
- Modify: `backend/finance_server/core/schema.py` (Funktion `create_liquidity_entries_table` nahe `create_budgets_table` bei Zeile 477; Aufruf in `initialize_database` bei Zeile ~742)
- Create: `backend/finance_server/db/liquidity.py`
- Create: `backend/finance_server/models/liquidity.py`
- Create: `backend/finance_server/api/liquidity.py`
- Modify: `backend/finance_server/main.py` (Import bei Zeile ~25, `include_router` bei Zeile ~101)
- Test: `backend/tests/test_liquidity.py`

**Interfaces:**
- Consumes: `finance_server.core.database.get_connection`, `finance_server.services.sync_logger.log_crud_event`.
- Produces:
  - `liquidity_entries`-Tabelle mit Spalten `id, label, amount, kind, certainty, created_at, updated_at`.
  - `finance_server.db.liquidity`: `list_entries() -> list[dict]`, `create_entry(label: str, amount: float, kind: str, certainty: str) -> dict`, `update_entry(entry_id: int, label=None, amount=None, kind=None, certainty=None) -> dict | None`, `delete_entry(entry_id: int) -> bool`.
  - HTTP: `GET/POST /api/db/liquidity-entries`, `PUT/DELETE /api/db/liquidity-entries/{id}`.

- [ ] **Step 1: Failing Test schreiben**

Create `backend/tests/test_liquidity.py`:

```python
from __future__ import annotations

import sqlite3
from unittest.mock import patch

import pytest

from finance_server.core.schema import create_liquidity_entries_table
from finance_server.db.liquidity import (
    create_entry,
    delete_entry,
    list_entries,
    update_entry,
)


def _make_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    create_liquidity_entries_table(conn)
    return conn


def _run(conn: sqlite3.Connection, fn):
    with patch("finance_server.db.liquidity.get_connection", return_value=conn), \
         patch("finance_server.db.liquidity.log_crud_event"):
        return fn()


class TestCreateEntry:
    def test_create_then_list(self):
        conn = _make_db()
        created = _run(conn, lambda: create_entry("Geschenke", 100.0, "expense", "certain"))

        assert created["label"] == "Geschenke"
        assert created["amount"] == 100.0
        assert created["kind"] == "expense"
        assert created["certainty"] == "certain"

        rows = _run(conn, list_entries)
        assert len(rows) == 1
        assert rows[0]["label"] == "Geschenke"

    def test_rejects_empty_label(self):
        conn = _make_db()
        with pytest.raises(ValueError, match="Bezeichnung"):
            _run(conn, lambda: create_entry("  ", 100.0, "expense", "certain"))

    def test_rejects_negative_amount(self):
        conn = _make_db()
        with pytest.raises(ValueError, match="negativ"):
            _run(conn, lambda: create_entry("Test", -5.0, "expense", "certain"))

    def test_rejects_invalid_kind(self):
        conn = _make_db()
        with pytest.raises(ValueError, match="Art"):
            _run(conn, lambda: create_entry("Test", 5.0, "transfer", "certain"))

    def test_rejects_invalid_certainty(self):
        conn = _make_db()
        with pytest.raises(ValueError, match="Sicherheit"):
            _run(conn, lambda: create_entry("Test", 5.0, "expense", "maybe"))


class TestUpdateEntry:
    def test_updates_amount_and_kind(self):
        conn = _make_db()
        created = _run(conn, lambda: create_entry("Test", 40.0, "expense", "certain"))
        updated = _run(conn, lambda: update_entry(created["id"], amount=60.0, kind="income"))

        assert updated["amount"] == 60.0
        assert updated["kind"] == "income"
        assert updated["certainty"] == "certain"

    def test_missing_returns_none(self):
        conn = _make_db()
        assert _run(conn, lambda: update_entry(123, amount=60.0)) is None


class TestDeleteEntry:
    def test_deletes(self):
        conn = _make_db()
        created = _run(conn, lambda: create_entry("Test", 40.0, "expense", "certain"))

        assert _run(conn, lambda: delete_entry(created["id"])) is True
        assert _run(conn, list_entries) == []

    def test_missing_returns_false(self):
        conn = _make_db()
        assert _run(conn, lambda: delete_entry(123)) is False
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag verifizieren**

Run (aus `backend/`): `python -m pytest tests/test_liquidity.py -q`
Expected: FAIL mit `ImportError` / `ModuleNotFoundError` (`finance_server.db.liquidity` / `create_liquidity_entries_table` fehlt).

- [ ] **Step 3: Schema-Funktion ergänzen**

In `backend/finance_server/core/schema.py` direkt nach `create_budgets_table` (endet bei Zeile 498) einfügen:

```python
def create_liquidity_entries_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS liquidity_entries (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            label       TEXT NOT NULL,
            amount      REAL NOT NULL CHECK(amount >= 0),
            kind        TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('income', 'expense')),
            certainty   TEXT NOT NULL DEFAULT 'certain' CHECK(certainty IN ('certain', 'expected')),
            created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
```

In `initialize_database` (Zeile 599) nach dem `create_budgets_table(connection)`-Aufruf (Zeile 742) ergänzen:

```python
    create_liquidity_entries_table(connection)
```

- [ ] **Step 4: DB-Modul schreiben**

Create `backend/finance_server/db/liquidity.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection
from finance_server.services.sync_logger import log_crud_event

_KINDS = {"income", "expense"}
_CERTAINTIES = {"certain", "expected"}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _validate_label(label: str) -> str:
    label = (label or "").strip()
    if not label:
        raise ValueError("Eintrag braucht eine Bezeichnung.")
    return label


def _validate_amount(amount: float) -> float:
    if amount is None or amount < 0:
        raise ValueError("Betrag darf nicht negativ sein.")
    return float(amount)


def _validate_enum(value: str, allowed: set[str], message: str) -> str:
    if value not in allowed:
        raise ValueError(message)
    return value


def _serialize(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "label": row["label"],
        "amount": round(float(row["amount"]), 2),
        "kind": row["kind"],
        "certainty": row["certainty"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_entries() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, label, amount, kind, certainty, created_at, updated_at "
            "FROM liquidity_entries ORDER BY id ASC"
        ).fetchall()
        return [_serialize(row) for row in rows]


def _get_entry(entry_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, label, amount, kind, certainty, created_at, updated_at "
            "FROM liquidity_entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
        return _serialize(row) if row else None


def create_entry(label: str, amount: float, kind: str, certainty: str) -> dict[str, Any]:
    label = _validate_label(label)
    amount = _validate_amount(amount)
    kind = _validate_enum(kind, _KINDS, "Ungültige Art. Nur 'income' oder 'expense' erlaubt.")
    certainty = _validate_enum(
        certainty, _CERTAINTIES, "Ungültige Sicherheit. Nur 'certain' oder 'expected' erlaubt."
    )
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO liquidity_entries (label, amount, kind, certainty) VALUES (?, ?, ?, ?)",
            (label, amount, kind, certainty),
        )
        entry_id = int(cursor.lastrowid)
    result = _get_entry(entry_id)
    if result:
        log_crud_event("liquidity_entries", entry_id, "INSERT", result)
    return result


def update_entry(
    entry_id: int,
    label: str | None = None,
    amount: float | None = None,
    kind: str | None = None,
    certainty: str | None = None,
) -> dict[str, Any] | None:
    sets: list[str] = []
    params: list[Any] = []
    if label is not None:
        sets.append("label = ?")
        params.append(_validate_label(label))
    if amount is not None:
        sets.append("amount = ?")
        params.append(_validate_amount(amount))
    if kind is not None:
        sets.append("kind = ?")
        params.append(_validate_enum(kind, _KINDS, "Ungültige Art. Nur 'income' oder 'expense' erlaubt."))
    if certainty is not None:
        sets.append("certainty = ?")
        params.append(
            _validate_enum(
                certainty, _CERTAINTIES, "Ungültige Sicherheit. Nur 'certain' oder 'expected' erlaubt."
            )
        )
    if not sets:
        return _get_entry(entry_id)
    params.extend([_now(), entry_id])
    with get_connection() as conn:
        cursor = conn.execute(
            f"UPDATE liquidity_entries SET {', '.join(sets)}, updated_at = ? WHERE id = ?", params
        )
        if cursor.rowcount <= 0:
            return None
    result = _get_entry(entry_id)
    if result:
        log_crud_event("liquidity_entries", entry_id, "UPDATE", result)
    return result


def delete_entry(entry_id: int) -> bool:
    entry = _get_entry(entry_id)
    if entry:
        log_crud_event("liquidity_entries", entry_id, "DELETE", entry)
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM liquidity_entries WHERE id = ?", (entry_id,))
    return cursor.rowcount > 0
```

- [ ] **Step 5: Pydantic-Modelle schreiben**

Create `backend/finance_server/models/liquidity.py`:

```python
from __future__ import annotations

from pydantic import BaseModel


class LiquidityEntryCreateRequest(BaseModel):
    label: str
    amount: float
    kind: str = "expense"
    certainty: str = "certain"


class LiquidityEntryUpdateRequest(BaseModel):
    label: str | None = None
    amount: float | None = None
    kind: str | None = None
    certainty: str | None = None
```

- [ ] **Step 6: API-Router schreiben**

Create `backend/finance_server/api/liquidity.py`:

```python
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from finance_server.db.liquidity import (
    create_entry,
    delete_entry,
    list_entries,
    update_entry,
)
from finance_server.models.liquidity import (
    LiquidityEntryCreateRequest,
    LiquidityEntryUpdateRequest,
)

router = APIRouter()


@router.get("/db/liquidity-entries")
def get_liquidity_entries() -> dict[str, Any]:
    return {"entries": list_entries()}


@router.post("/db/liquidity-entries")
def create_liquidity_entry_endpoint(request: LiquidityEntryCreateRequest) -> dict[str, Any]:
    try:
        return create_entry(request.label, request.amount, request.kind, request.certainty)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/db/liquidity-entries/{entry_id}")
def update_liquidity_entry_endpoint(
    entry_id: int, request: LiquidityEntryUpdateRequest
) -> dict[str, Any]:
    try:
        result = update_entry(
            entry_id,
            label=request.label,
            amount=request.amount,
            kind=request.kind,
            certainty=request.certainty,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if result is None:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    return result


@router.delete("/db/liquidity-entries/{entry_id}")
def delete_liquidity_entry_endpoint(entry_id: int) -> dict[str, Any]:
    if not delete_entry(entry_id):
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    return {"deleted": True}
```

- [ ] **Step 7: Router registrieren**

In `backend/finance_server/main.py` nach der `budgets`-Importzeile (Zeile 25) ergänzen:

```python
from finance_server.api.liquidity import router as liquidity_router
```

Und nach `app.include_router(budgets_router, prefix="/api")` (Zeile 101) ergänzen:

```python
app.include_router(liquidity_router, prefix="/api")
```

- [ ] **Step 8: Tests laufen lassen**

Run (aus `backend/`): `python -m pytest tests/test_liquidity.py -q`
Expected: PASS (alle Tests grün).

Run (aus `backend/`): `python -m pytest -q`
Expected: keine neuen Fehlschläge (bestehende Suite bleibt grün).

- [ ] **Step 9: Commit (nur mit Freigabe)**

```bash
git add backend/finance_server/core/schema.py backend/finance_server/db/liquidity.py backend/finance_server/models/liquidity.py backend/finance_server/api/liquidity.py backend/finance_server/main.py backend/tests/test_liquidity.py
git commit -m "feat: Liquiditätscheck-Backend (Einträge-CRUD)"
```

---

### Task 2: Frontend — API-Client und Typen

**Files:**
- Create: `frontend/src/lib/liquidity.ts`

**Interfaces:**
- Consumes: `getApiBaseUrl`, `parseJsonResponse` aus `@/lib/api`; Endpunkte aus Task 1.
- Produces:
  - Typen `LiquidityKind = "income" | "expense"`, `LiquidityCertainty = "certain" | "expected"`, `LiquidityEntry { id, label, amount, kind, certainty, created_at?, updated_at? }`, `LiquidityEntryInput { label, amount, kind, certainty }`, `PendingTransactionDto`.
  - Funktionen `fetchLiquidityEntries()`, `createLiquidityEntry(input)`, `updateLiquidityEntry(id, input)`, `deleteLiquidityEntry(id)`, `fetchBalanceTotal()`, `fetchPendingTransactions()`.

- [ ] **Step 1: Datei schreiben**

Create `frontend/src/lib/liquidity.ts`:

```ts
import { getApiBaseUrl, parseJsonResponse } from "./api";

export type LiquidityKind = "income" | "expense";
export type LiquidityCertainty = "certain" | "expected";

export type LiquidityEntry = {
  id: number;
  label: string;
  amount: number;
  kind: LiquidityKind;
  certainty: LiquidityCertainty;
  created_at?: string;
  updated_at?: string;
};

export type LiquidityEntryInput = {
  label: string;
  amount: number;
  kind: LiquidityKind;
  certainty: LiquidityCertainty;
};

export type PendingTransactionDto = {
  amount: number;
  date: string | null;
  entry_date?: string | null;
  purpose?: string | null;
  recipient_name?: string | null;
  applicant_name?: string | null;
};

export async function fetchLiquidityEntries(): Promise<LiquidityEntry[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/liquidity-entries`);
  const data = await parseJsonResponse(response);
  return data.entries ?? [];
}

export async function createLiquidityEntry(input: LiquidityEntryInput): Promise<LiquidityEntry> {
  const response = await fetch(`${getApiBaseUrl()}/db/liquidity-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonResponse(response);
}

export async function updateLiquidityEntry(
  id: number,
  input: LiquidityEntryInput,
): Promise<LiquidityEntry> {
  const response = await fetch(`${getApiBaseUrl()}/db/liquidity-entries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonResponse(response);
}

export async function deleteLiquidityEntry(id: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/liquidity-entries/${id}`, {
    method: "DELETE",
  });
  await parseJsonResponse(response);
}

type AccountBalanceDto = { account_iban: string; balance: number };

export async function fetchBalanceTotal(): Promise<number> {
  const response = await fetch(`${getApiBaseUrl()}/db/account-balances?days=36500`);
  const data = await parseJsonResponse(response);
  const balances: AccountBalanceDto[] = Array.isArray(data) ? data : (data.balances ?? []);
  return balances.reduce((sum, balance) => sum + Number(balance.balance ?? 0), 0);
}

export async function fetchPendingTransactions(): Promise<PendingTransactionDto[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/transactions?days=1`);
  const data = await parseJsonResponse(response);
  return Array.isArray(data?.pending) ? data.pending : [];
}
```

- [ ] **Step 2: Typcheck**

Run (aus `frontend/`): `npx tsc --noEmit`
Expected: keine Fehler in `src/lib/liquidity.ts`.

- [ ] **Step 3: Commit (nur mit Freigabe)**

```bash
git add frontend/src/lib/liquidity.ts
git commit -m "feat: Liquiditätscheck-API-Client"
```

---

### Task 3: Frontend — Reine Rechenlogik und Test

**Files:**
- Create: `frontend/src/pages/liquidity/utils.ts`
- Test: `frontend/src/pages/liquidity/utils.test.ts`

**Interfaces:**
- Consumes (nur Typen): `LiquidityEntry`, `PendingTransactionDto` aus `@/lib/liquidity`; `Subscription` aus `@/pages/subscriptions/hooks/use-subscriptions`.
- Produces:
  - `LiquidityStatus = "covered" | "best_case" | "shortfall"`
  - `LiquidityAutoItem { id: string; label: string; amount: number; date: string | null; source: "subscription" | "pending" }`
  - `LiquidityResult { certainIncome; certainExpense; expectedIncome; expectedExpense; certainBalance; bestBalance; status; discrepancy }`
  - `projectSubscriptions(subscriptions, fromDate, endDate): LiquidityAutoItem[]`
  - `buildAutoItems({ subscriptions, pending, fromDate, endDate, includeSubscriptions, includePending }): LiquidityAutoItem[]`
  - `computeLiquidity({ startBalance, entries, autoItems }): LiquidityResult`

- [ ] **Step 1: Failing Test schreiben**

Create `frontend/src/pages/liquidity/utils.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildAutoItems, computeLiquidity, projectSubscriptions } from "./utils.ts";

test("covered: shows the surplus when certain balance is positive", () => {
  const result = computeLiquidity({
    startBalance: 1000,
    entries: [
      { id: 1, label: "Gehalt", amount: 2000, kind: "income", certainty: "certain" },
      { id: 2, label: "Miete", amount: 500, kind: "expense", certainty: "certain" },
    ],
    autoItems: [
      { id: "a", label: "Netflix", amount: -15, date: "2026-11-01", source: "subscription" },
    ],
  });

  assert.equal(result.certainBalance, 2485);
  assert.equal(result.status, "covered");
  assert.equal(result.discrepancy, 2485);
});

test("best_case: expected income closes the certain gap", () => {
  const result = computeLiquidity({
    startBalance: 100,
    entries: [
      { id: 1, label: "Weihnachtsgeld", amount: 500, kind: "income", certainty: "expected" },
      { id: 2, label: "Geschenke", amount: 300, kind: "expense", certainty: "certain" },
    ],
    autoItems: [],
  });

  assert.equal(result.certainBalance, -200);
  assert.equal(result.bestBalance, 300);
  assert.equal(result.status, "best_case");
  assert.equal(result.discrepancy, -200);
});

test("shortfall: negative even in the best case", () => {
  const result = computeLiquidity({
    startBalance: 0,
    entries: [
      { id: 1, label: "Urlaub", amount: 1000, kind: "expense", certainty: "certain" },
      { id: 2, label: "Bonus", amount: 200, kind: "income", certainty: "expected" },
    ],
    autoItems: [],
  });

  assert.equal(result.bestBalance, -800);
  assert.equal(result.status, "shortfall");
  assert.equal(result.discrepancy, -800);
});

test("projectSubscriptions steps monthly through the range", () => {
  const subscriptions = [
    {
      name: "Netflix",
      amount: 15,
      effectiveAmount: 15,
      direction: "expense",
      frequency: "MONTHLY",
      nextDate: "2026-11-15",
      recipientId: 1,
    },
  ];

  const items = projectSubscriptions(
    subscriptions as never,
    new Date(2026, 9, 7),
    new Date(2026, 11, 31),
  );

  assert.deepEqual(
    items.map((item) => item.date),
    ["2026-11-15", "2026-12-15"],
  );
  assert.equal(items[0].amount, -15);
});

test("buildAutoItems includes pending transactions within the range", () => {
  const items = buildAutoItems({
    subscriptions: [],
    pending: [{ amount: -100, date: "2026-11-01", recipient_name: "Vermieter" }],
    fromDate: new Date(2026, 9, 7),
    endDate: new Date(2026, 11, 31),
    includeSubscriptions: false,
    includePending: true,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Vermieter");
  assert.equal(items[0].amount, -100);
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag verifizieren**

Run (aus `frontend/`): `node --test src/pages/liquidity/utils.test.ts`
Expected: FAIL mit `Cannot find module './utils.ts'`.

- [ ] **Step 3: Implementierung schreiben**

Create `frontend/src/pages/liquidity/utils.ts`:

```ts
import type { LiquidityEntry, PendingTransactionDto } from "@/lib/liquidity";
import type { Subscription } from "@/pages/subscriptions/hooks/use-subscriptions";

export type LiquidityStatus = "covered" | "best_case" | "shortfall";

export type LiquidityAutoItem = {
  id: string;
  label: string;
  amount: number;
  date: string | null;
  source: "subscription" | "pending";
};

export type LiquidityResult = {
  certainIncome: number;
  certainExpense: number;
  expectedIncome: number;
  expectedExpense: number;
  certainBalance: number;
  bestBalance: number;
  status: LiquidityStatus;
  discrepancy: number;
};

const FREQUENCY_MONTHS: Record<Subscription["frequency"], number> = {
  MONTHLY: 1,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

export function projectSubscriptions(
  subscriptions: Subscription[],
  fromDate: Date,
  endDate: Date,
): LiquidityAutoItem[] {
  const items: LiquidityAutoItem[] = [];
  for (const subscription of subscriptions) {
    if (subscription.dismissed || subscription.ended || subscription.active === false) continue;
    if (!subscription.nextDate) continue;
    const amount = Math.abs(subscription.effectiveAmount ?? subscription.amount ?? 0);
    if (amount <= 0) continue;
    const step = FREQUENCY_MONTHS[subscription.frequency] ?? 1;
    const signed = subscription.direction === "expense" ? -amount : amount;
    let cursor = parseIsoDate(subscription.nextDate);
    let guard = 0;
    while (cursor <= endDate && guard < 1200) {
      if (cursor >= fromDate) {
        items.push({
          id: `sub-${subscription.name}-${formatIsoDate(cursor)}-${guard}`,
          label: subscription.name,
          amount: signed,
          date: formatIsoDate(cursor),
          source: "subscription",
        });
      }
      cursor = addMonths(cursor, step);
      guard += 1;
    }
  }
  return items;
}

export function buildAutoItems({
  subscriptions,
  pending,
  fromDate,
  endDate,
  includeSubscriptions,
  includePending,
}: {
  subscriptions: Subscription[];
  pending: PendingTransactionDto[];
  fromDate: Date;
  endDate: Date;
  includeSubscriptions: boolean;
  includePending: boolean;
}): LiquidityAutoItem[] {
  const items: LiquidityAutoItem[] = [];
  if (includeSubscriptions) {
    items.push(...projectSubscriptions(subscriptions, fromDate, endDate));
  }
  if (includePending) {
    pending.forEach((transaction, index) => {
      const iso = transaction.date ?? transaction.entry_date ?? null;
      if (iso && parseIsoDate(iso) > endDate) return;
      items.push({
        id: `pending-${index}-${iso ?? "x"}`,
        label:
          transaction.recipient_name ||
          transaction.applicant_name ||
          transaction.purpose ||
          "Vorgemerkte Transaktion",
        amount: transaction.amount,
        date: iso,
        source: "pending",
      });
    });
  }
  return items;
}

export function computeLiquidity({
  startBalance,
  entries,
  autoItems,
}: {
  startBalance: number;
  entries: LiquidityEntry[];
  autoItems: LiquidityAutoItem[];
}): LiquidityResult {
  let certainIncome = 0;
  let certainExpense = 0;
  let expectedIncome = 0;
  let expectedExpense = 0;

  for (const entry of entries) {
    const amount = Math.abs(entry.amount);
    if (entry.kind === "income") {
      if (entry.certainty === "certain") certainIncome += amount;
      else expectedIncome += amount;
    } else if (entry.certainty === "certain") {
      certainExpense += amount;
    } else {
      expectedExpense += amount;
    }
  }

  for (const item of autoItems) {
    if (item.amount >= 0) certainIncome += item.amount;
    else certainExpense += -item.amount;
  }

  const certainBalance = startBalance + certainIncome - certainExpense;
  const bestBalance = certainBalance + expectedIncome - expectedExpense;

  let status: LiquidityStatus;
  let discrepancy: number;
  if (certainBalance >= 0) {
    status = "covered";
    discrepancy = certainBalance;
  } else if (bestBalance >= 0) {
    status = "best_case";
    discrepancy = certainBalance;
  } else {
    status = "shortfall";
    discrepancy = bestBalance;
  }

  return {
    certainIncome,
    certainExpense,
    expectedIncome,
    expectedExpense,
    certainBalance,
    bestBalance,
    status,
    discrepancy,
  };
}
```

- [ ] **Step 4: Test laufen lassen**

Run (aus `frontend/`): `node --test src/pages/liquidity/utils.test.ts`
Expected: PASS (alle 5 Tests grün).

- [ ] **Step 5: Commit (nur mit Freigabe)**

```bash
git add frontend/src/pages/liquidity/utils.ts frontend/src/pages/liquidity/utils.test.ts
git commit -m "feat: Liquiditätscheck-Rechenlogik mit Test"
```

---

### Task 4: Frontend — Daten-Hook

**Files:**
- Create: `frontend/src/pages/liquidity/hooks/use-liquidity.ts`

**Interfaces:**
- Consumes: alles aus `@/lib/liquidity` (Task 2), `fetchChartSubscriptions` + `Subscription` aus `@/pages/subscriptions/hooks/use-subscriptions`, `getErrorMessage` aus `@/lib/utils/error`.
- Produces: `useLiquidity(): { entries, subscriptions, pending, balanceTotal, loading, error, reload, create, update, remove }`.

- [ ] **Step 1: Datei schreiben**

Create `frontend/src/pages/liquidity/hooks/use-liquidity.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import {
  createLiquidityEntry,
  deleteLiquidityEntry,
  fetchBalanceTotal,
  fetchLiquidityEntries,
  fetchPendingTransactions,
  updateLiquidityEntry,
  type LiquidityEntry,
  type LiquidityEntryInput,
  type PendingTransactionDto,
} from "@/lib/liquidity";
import { getErrorMessage } from "@/lib/utils/error";
import {
  fetchChartSubscriptions,
  type Subscription,
} from "@/pages/subscriptions/hooks/use-subscriptions";

export function useLiquidity() {
  const [entries, setEntries] = useState<LiquidityEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pending, setPending] = useState<PendingTransactionDto[]>([]);
  const [balanceTotal, setBalanceTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [entryList, subs, total, pendingTransactions] = await Promise.all([
        fetchLiquidityEntries(),
        fetchChartSubscriptions().catch(() => []),
        fetchBalanceTotal().catch(() => 0),
        fetchPendingTransactions().catch(() => []),
      ]);
      setEntries(entryList);
      setSubscriptions(subs);
      setBalanceTotal(total);
      setPending(pendingTransactions);
      setLoading(false);
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async (input: LiquidityEntryInput) => {
    const created = await createLiquidityEntry(input);
    setEntries((prev) => [...prev, created]);
  }, []);

  const update = useCallback(async (id: number, input: LiquidityEntryInput) => {
    const updated = await updateLiquidityEntry(id, input);
    setEntries((prev) => prev.map((entry) => (entry.id === id ? updated : entry)));
  }, []);

  const remove = useCallback(async (id: number) => {
    await deleteLiquidityEntry(id);
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  return {
    entries,
    subscriptions,
    pending,
    balanceTotal,
    loading,
    error,
    reload: load,
    create,
    update,
    remove,
  };
}
```

- [ ] **Step 2: Typcheck**

Run (aus `frontend/`): `npx tsc --noEmit`
Expected: keine Fehler in `src/pages/liquidity/hooks/use-liquidity.ts`.

- [ ] **Step 3: Commit (nur mit Freigabe)**

```bash
git add frontend/src/pages/liquidity/hooks/use-liquidity.ts
git commit -m "feat: Liquiditätscheck-Datenhook"
```

---

### Task 5: Frontend — UI-Komponenten und Seite

**Files:**
- Create: `frontend/src/pages/liquidity/components/liquidity-result-card.tsx`
- Create: `frontend/src/pages/liquidity/components/auto-items.tsx`
- Create: `frontend/src/pages/liquidity/components/entry-form.tsx`
- Create: `frontend/src/pages/liquidity/liquidity-page.tsx`

**Interfaces:**
- Consumes: `useLiquidity` (Task 4), `computeLiquidity` + `buildAutoItems` + `LiquidityAutoItem` + `LiquidityResult` (Task 3), `formatAmount` + `formatDate` aus `@/lib/utils/format`, UI-Bausteine aus `@/components/*`.
- Produces: Default-Export `LiquidityPage` in `frontend/src/pages/liquidity/liquidity-page.tsx`.

- [ ] **Step 1: Ergebnis-Karte schreiben**

Create `frontend/src/pages/liquidity/components/liquidity-result-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { formatAmount } from "@/lib/utils/format";
import type { LiquidityResult } from "../utils";

const STATUS: Record<LiquidityResult["status"], { label: string; className: string }> = {
  covered: { label: "Garantiert gedeckt", className: "text-emerald-600 dark:text-emerald-400" },
  best_case: {
    label: "Nur im Best Case gedeckt",
    className: "text-amber-600 dark:text-amber-400",
  },
  shortfall: { label: "Nicht gedeckt", className: "text-destructive" },
};

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatAmount(value)}</span>
    </div>
  );
}

export function LiquidityResultCard({ result }: { result: LiquidityResult }) {
  const status = STATUS[result.status];
  return (
    <Card className="border-none bg-muted/40 shadow-none">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <span className={`text-sm font-medium ${status.className}`}>{status.label}</span>
          <span className={`text-3xl font-semibold tabular-nums ${status.className}`}>
            {formatAmount(result.discrepancy)}
          </span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Row label="Sichere Einnahmen" value={result.certainIncome} />
          <Row label="Sichere Ausgaben" value={-result.certainExpense} />
          <Row
            label="Erwarteter Saldo"
            value={result.expectedIncome - result.expectedExpense}
          />
          <Row label="Saldo garantiert" value={result.certainBalance} />
          <Row label="Saldo Best Case" value={result.bestBalance} />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Auto-Posten-Liste schreiben**

Create `frontend/src/pages/liquidity/components/auto-items.tsx`:

```tsx
import { formatAmount, formatDate } from "@/lib/utils/format";
import type { LiquidityAutoItem } from "../utils";

export function AutoItems({ items }: { items: LiquidityAutoItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 border-b border-border/60 px-1 py-2 text-sm last:border-b-0"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate">{item.label}</span>
            <span className="text-xs text-muted-foreground">
              {item.source === "subscription" ? "Abo" : "Vorgemerkt"}
              {item.date ? ` · ${formatDate(item.date)}` : ""}
            </span>
          </div>
          <span
            className={`shrink-0 tabular-nums ${
              item.amount < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {formatAmount(item.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Eintrags-Formular schreiben**

Create `frontend/src/pages/liquidity/components/entry-form.tsx`:

```tsx
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  LiquidityCertainty,
  LiquidityEntryInput,
  LiquidityKind,
} from "@/lib/liquidity";

export function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: LiquidityEntryInput;
  submitLabel: string;
  onSubmit: (input: LiquidityEntryInput) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [kind, setKind] = useState<LiquidityKind>(initial?.kind ?? "expense");
  const [certainty, setCertainty] = useState<LiquidityCertainty>(
    initial?.certainty ?? "certain",
  );
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!label.trim() || !Number.isFinite(value) || value < 0) return;
    setBusy(true);
    try {
      await onSubmit({ label: label.trim(), amount: value, kind, certainty });
      if (!initial) {
        setLabel("");
        setAmount("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        className="min-w-40 flex-1"
        placeholder="Bezeichnung (z. B. Geschenke)"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <Input
        className="w-28"
        inputMode="decimal"
        placeholder="Betrag"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <Button
        type="button"
        size="sm"
        variant={kind === "expense" ? "default" : "outline"}
        className="h-8 text-xs"
        onClick={() => setKind("expense")}
      >
        Ausgabe
      </Button>
      <Button
        type="button"
        size="sm"
        variant={kind === "income" ? "default" : "outline"}
        className="h-8 text-xs"
        onClick={() => setKind("income")}
      >
        Einnahme
      </Button>
      <Button
        type="button"
        size="sm"
        variant={certainty === "certain" ? "default" : "outline"}
        className="h-8 text-xs"
        onClick={() => setCertainty("certain")}
      >
        sicher
      </Button>
      <Button
        type="button"
        size="sm"
        variant={certainty === "expected" ? "default" : "outline"}
        className="h-8 text-xs"
        onClick={() => setCertainty("expected")}
      >
        erwartet
      </Button>
      <Button type="submit" size="sm" className="h-8 text-xs" disabled={busy}>
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={onCancel}
        >
          Abbrechen
        </Button>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 4: Seite schreiben**

Create `frontend/src/pages/liquidity/liquidity-page.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LiquidityEntryInput } from "@/lib/liquidity";
import { formatAmount } from "@/lib/utils/format";
import { AutoItems } from "./components/auto-items";
import { EntryForm } from "./components/entry-form";
import { LiquidityResultCard } from "./components/liquidity-result-card";
import { useLiquidity } from "./hooks/use-liquidity";
import { buildAutoItems, computeLiquidity, type LiquidityAutoItem } from "./utils";

function defaultEndDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 11, 31);
}

export default function LiquidityPage() {
  const { entries, subscriptions, pending, balanceTotal, loading, error, create, update, remove } =
    useLiquidity();
  const today = useMemo(() => new Date(), []);
  const [endDate, setEndDate] = useState<Date | null>(defaultEndDate);
  const [startOverride, setStartOverride] = useState("");
  const [includeSubscriptions, setIncludeSubscriptions] = useState(true);
  const [includePending, setIncludePending] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);

  const startBalance =
    startOverride.trim() === ""
      ? balanceTotal
      : Number(startOverride.replace(",", ".")) || 0;

  const autoItems = useMemo<LiquidityAutoItem[]>(
    () =>
      buildAutoItems({
        subscriptions,
        pending,
        fromDate: today,
        endDate: endDate ?? defaultEndDate(),
        includeSubscriptions,
        includePending,
      }),
    [subscriptions, pending, today, endDate, includeSubscriptions, includePending],
  );

  const result = useMemo(
    () => computeLiquidity({ startBalance, entries, autoItems }),
    [startBalance, entries, autoItems],
  );

  const handleCreate = async (input: LiquidityEntryInput) => {
    try {
      await create(input);
      toast.success("Eintrag angelegt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  };

  const handleUpdate = async (id: number, input: LiquidityEntryInput) => {
    try {
      await update(id, input);
      setEditingId(null);
      toast.success("Eintrag aktualisiert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
      throw err;
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await remove(id);
      toast.success("Eintrag gelöscht");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 py-6">
      <Card className="border-none bg-muted/40 shadow-none">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <Label htmlFor="start-balance">Startliquidität</Label>
            <Input
              id="start-balance"
              inputMode="decimal"
              className="w-40"
              placeholder={formatAmount(balanceTotal)}
              value={startOverride}
              onChange={(event) => setStartOverride(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Leer = aktueller Kontostand ({formatAmount(balanceTotal)})
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Enddatum</Label>
            <DatePicker value={endDate} onChange={setEndDate} />
          </div>
        </CardContent>
      </Card>

      <LiquidityResultCard result={result} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <Switch
                id="include-subscriptions"
                checked={includeSubscriptions}
                onCheckedChange={setIncludeSubscriptions}
              />
              <Label htmlFor="include-subscriptions">Abos einbeziehen</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="include-pending"
                checked={includePending}
                onCheckedChange={setIncludePending}
              />
              <Label htmlFor="include-pending">Vorgemerkte einbeziehen</Label>
            </div>
          </div>

          {autoItems.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Automatisch
              </span>
              <AutoItems items={autoItems} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Eigene Einträge
          </span>

          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <EmptyState title="Einträge konnten nicht geladen werden" text={error} />
          ) : (
            <>
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Noch keine Einträge. Füge Einnahmen oder Ausgaben hinzu.
                </p>
              ) : (
                <div className="flex flex-col">
                  {entries.map((entry) =>
                    editingId === entry.id ? (
                      <div key={entry.id} className="border-b border-border/60 py-2 last:border-b-0">
                        <EntryForm
                          initial={entry}
                          submitLabel="Speichern"
                          onSubmit={(input) => handleUpdate(entry.id, input)}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-b-0"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{entry.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {entry.certainty === "certain" ? "sicher" : "erwartet"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`tabular-nums ${
                              entry.kind === "expense"
                                ? "text-destructive"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {formatAmount(entry.kind === "expense" ? -entry.amount : entry.amount)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setEditingId(entry.id)}
                            aria-label="Bearbeiten"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive"
                            onClick={() => void handleRemove(entry.id)}
                            aria-label="Löschen"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}

              <div className="pt-1">
                <EntryForm submitLabel="Hinzufügen" onSubmit={handleCreate} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Typcheck und Tests**

Run (aus `frontend/`): `npx tsc --noEmit`
Expected: keine Fehler.

Run (aus `frontend/`): `node --test src/pages/liquidity/utils.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit (nur mit Freigabe)**

```bash
git add frontend/src/pages/liquidity
git commit -m "feat: Liquiditätscheck-Seite"
```

---

### Task 6: Route und Sidebar-Eintrag

**Files:**
- Modify: `frontend/src/App.tsx` (Lazy-Imports Zeile 11-18, Route bei Zeile ~116-131)
- Modify: `frontend/src/layouts/sidebar/app-sidebar.tsx` (Icon-Import Zeile 2, `navMain` Zeile 48-58)

**Interfaces:**
- Consumes: `LiquidityPage` (Task 5).
- Produces: Route `/liquidity` und Sidebar-Eintrag „Liquiditätscheck".

- [ ] **Step 1: Lazy-Import ergänzen**

In `frontend/src/App.tsx` nach Zeile 18 (`const AssistantPage = ...`) einfügen:

```tsx
const LiquidityPage = lazy(() => import("@/pages/liquidity/liquidity-page"));
```

- [ ] **Step 2: Route ergänzen**

In `frontend/src/App.tsx` nach dem `/budgets`-`<Route>`-Block (vor dem `/assistant`-Block) einfügen:

```tsx
              <Route
                path="/liquidity"
                element={
                  <ErrorBoundary pageName="Liquiditätscheck">
                    <LiquidityPage />
                  </ErrorBoundary>
                }
              />
```

- [ ] **Step 3: Sidebar-Eintrag ergänzen**

In `frontend/src/layouts/sidebar/app-sidebar.tsx` Zeile 2 das Icon `PiggyBank` ergänzen:

```tsx
import { FileText, Gauge, PiggyBank, Repeat, Sparkles, Target, Wallet, Waypoints } from "lucide-react";
```

In `navMain` (Zeile 48-58) nach dem `Budgets`-Eintrag einfügen:

```tsx
    { title: "Liquiditätscheck", url: "/liquidity", icon: PiggyBank },
```

- [ ] **Step 4: Typcheck und Build**

Run (aus `frontend/`): `npx tsc --noEmit`
Expected: keine Fehler.

Run (aus `frontend/`): `npm run build`
Expected: Build erfolgreich.

- [ ] **Step 5: Manueller Smoke-Test**

`pnpm run dev` starten, `/liquidity` öffnen und prüfen:
1. Startliquidität zeigt den Kontostand als Platzhalter.
2. Eintrag „Geschenke 100 €" (Ausgabe, sicher) hinzufügen → Ergebnis-Differenz sinkt um 100 €.
3. Eintrag mit „erwartet" und positiver Einnahme ändert nur den Best-Case-Saldo.
4. Abos/Vorgemerkte ein-/ausschalten ändert den garantierten Saldo entsprechend.
5. Bearbeiten und Löschen funktionieren und aktualisieren die Kennzahl sofort.
6. Reload der Seite → Einträge bleiben erhalten.

- [ ] **Step 6: Commit (nur mit Freigabe)**

```bash
git add frontend/src/App.tsx frontend/src/layouts/sidebar/app-sidebar.tsx
git commit -m "feat: Liquiditätscheck-Route und Sidebar-Eintrag"
```

---

## Self-Review

- **Spec coverage:** Tabelle+CRUD (Task 1), API-Client (Task 2), Rechenlogik inkl. Projektion und Status (Task 3), Datenbeschaffung inkl. Kontostände/Abos/Vorgemerkte (Task 4), UI mit Startliquidität/Enddatum/Toggles/Ergebnis/Einträge (Task 5), Route+Sidebar (Task 6). Alle Spec-Abschnitte abgedeckt.
- **Placeholder:** keine „TBD"/„TODO"/„implement later"; jeder Code-Schritt enthält vollständigen Code.
- **Type consistency:** `LiquidityEntry`/`LiquidityEntryInput`/`PendingTransactionDto` (Task 2) werden in Task 3-5 identisch verwendet; `computeLiquidity`/`buildAutoItems`/`projectSubscriptions`/`LiquidityAutoItem`/`LiquidityResult` (Task 3) genau so in Task 4-5; Endpunkte aus Task 1 entsprechen den Client-Pfaden in Task 2.
