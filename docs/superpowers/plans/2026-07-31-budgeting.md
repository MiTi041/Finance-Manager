# Budgetierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monatliche Budgets pro Kategorie (z.B. Lebensmittel 100 €) mit Live-Ausgaben-Tracking, Fortschrittsbalken und Sidebar-Badge.

**Architecture:** FastAPI-Backend mit SQLite. Neue Tabelle `budgets` (wiederkehrender Betrag pro Kategorie), Ausgaben werden live pro Monat aus `umsaetze` berechnet (rekursive CTE über Kategorie + Unterkategorien, refund-bereinigt). React-Seite `/budgets` mit Monats-Navigation; Sidebar-Badge zeigt Anzahl überzogener Budgets. Budgets werden wie andere Tabellen via `log_crud_event` + Sync-Registry synchronisiert.

**Tech Stack:** Python 3.11 (FastAPI, SQLite), React 19 (Vite, HashRouter, shadcn/ui), pytest.

## Global Constraints

- Backend-Formatierung: black/isort, line-length 100, Doppelquote; `ruff check` muss grün sein.
- Budgets gelten **über alle Konten** und sind **monatlich wiederkehrend** (kein Rollover).
- Ausgaben-Logik identisch zu `db/analytics.py:156`: nur `amount < 0` zählen, refund-bereinigt mit `u.amount + COALESCE(u.refund_total, 0)`, dann ABS.
- Ausgaben-Spalte in `umsaetze` = `kategorie`; Datum = `COALESCE(entry_date, date, substr(created_at, 1, 10))`, Monatsfilter via `strftime('%Y-%m', ...)`.
- Keine neuen Dependencies. Keine deutschen Strings in Code-Kommentaren.
- Commits im Repo-Stil, konventionell (`feat(budgets): ...`).
- Frontend: `npx tsc --noEmit` und `pnpm build` müssen grün sein (aus `frontend/`).
- Backend-Tests: `cd backend && .venv/bin/python -m pytest tests/test_budgets.py -v` muss grün sein.

---

### Task 1: Backend — `budgets`-Tabelle (Schema + Sync-Registry)

**Files:**
- Modify: `backend/finance_server/core/schema.py`
- Modify: `backend/finance_server/db/sync.py`
- Test: `backend/tests/test_schema.py` (neu)

**Interfaces:**
- Consumes: bestehende `initialize_database`-Struktur in `schema.py:428`.
- Produces: Tabelle `budgets` (Spalten `id`, `category_id`, `monthly_amount`, `created_at`, `updated_at`); Sync-Whitelist erweitert.

- [ ] **Step 1: Write the failing test**

Neu erstellen `backend/tests/test_schema.py`:

```python
import sqlite3

from finance_server.core.schema import initialize_database


def test_initialize_database_creates_budgets_table():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_database(conn)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(budgets)")}
    assert {"id", "category_id", "monthly_amount", "created_at", "updated_at"} <= cols
    conn.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `backend/`): `.venv/bin/python -m pytest tests/test_schema.py -v`
Expected: FAIL mit `no such table: budgets`.

- [ ] **Step 3: Implement schema**

In `backend/finance_server/core/schema.py` neue Funktion nach `create_savings_plans_table` (Zeile ~355) einfügen:

```python
def create_budgets_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id    INTEGER NOT NULL UNIQUE,
            monthly_amount REAL NOT NULL CHECK(monthly_amount >= 0),
            created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES kategorien(id) ON DELETE CASCADE
        )
    """)
```

In `initialize_database` nach `create_allocation_run_buckets_table(connection)` (Zeile 522) einfügen:

```python
    create_budgets_table(connection)
```

In `backend/finance_server/db/sync.py`:
- Zeile 78 (`VALID_SYNC_TABLES`) ergänzen:

```python
    "allocation_buckets", "allocation_bafoeg_config", "savings_plans", "budgets",
```

- Nach Zeile 110 (`VALID_SYNC_COLUMNS`) ergänzen:

```python
    "budgets": {"id", "category_id", "monthly_amount", "created_at", "updated_at"},
```

- [ ] **Step 4: Run test to verify it passes**

Run (in `backend/`): `.venv/bin/python -m pytest tests/test_schema.py -v`
Expected: PASS.

- [ ] **Step 5: Ruff + Commit**

```bash
cd backend && .venv/bin/python -m ruff check finance_server/core/schema.py finance_server/db/sync.py tests/test_schema.py
git add backend/finance_server/core/schema.py backend/finance_server/db/sync.py backend/tests/test_schema.py
git commit -m "feat(budgets): add budgets table schema and sync whitelist"
```

---

### Task 2: Backend — `db/budgets.py` (CRUD + Ausgaben-Berechnung)

**Files:**
- Create: `backend/finance_server/db/budgets.py`
- Test: `backend/tests/test_budgets.py` (neu)

**Interfaces:**
- Consumes: Tabelle `budgets` aus Task 1.
- Produces:
  - `list_budgets(month: str) -> list[dict[str, Any]]`
  - `create_budget(category_id: int, monthly_amount: float) -> dict[str, Any]`
  - `update_budget(budget_id: int, monthly_amount: float) -> dict[str, Any] | None`
  - `delete_budget(budget_id: int) -> bool`

Jeder Eintrag: `{"id", "category_id", "monthly_amount", "spent", "remaining", "is_over"}` — plus `name`/`icon` in `list_budgets`.

- [ ] **Step 1: Write the failing test**

Neu erstellen `backend/tests/test_budgets.py`:

```python
from __future__ import annotations

import sqlite3
from unittest.mock import patch

import pytest

from finance_server.db.budgets import (
    list_budgets,
    create_budget,
    update_budget,
    delete_budget,
)


def _make_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE kategorien (
            id INTEGER PRIMARY KEY,
            name TEXT,
            typ TEXT,
            parent_id INTEGER,
            icon TEXT
        );
        CREATE TABLE budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL UNIQUE,
            monthly_amount REAL NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE umsaetze (
            id INTEGER PRIMARY KEY,
            kategorie INTEGER,
            amount REAL,
            entry_date TEXT,
            date TEXT,
            created_at TEXT,
            refund_total REAL
        );
    """)
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (1, "Freizeit", "Ausgabe", None, "🎉"),
    )
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (2, "Gaming", "Ausgabe", 1, "🎮"),
    )
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (3, "Kino", "Ausgabe", 1, "🎬"),
    )
    conn.execute(
        "INSERT INTO kategorien (id, name, typ, parent_id, icon) VALUES (?, ?, ?, ?, ?)",
        (4, "Einnahmen", "Einnahme", None, "💰"),
    )
    return conn


def _tx(conn: sqlite3.Connection, month: str, amount: float, cat: int | None, refund_total: float = 0) -> None:
    conn.execute(
        "INSERT INTO umsaetze (kategorie, amount, entry_date, date, created_at, refund_total) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (cat, amount, f"{month}-15", f"{month}-15", f"{month}-15T10:00:00", refund_total),
    )


def _run(conn: sqlite3.Connection, fn):
    with patch("finance_server.db.budgets.get_connection", return_value=conn), \
         patch("finance_server.db.budgets.log_crud_event"):
        return fn()


class TestListBudgets:
    def test_spent_includes_children_and_ignores_other_months_income_refunds(self):
        conn = _make_db()
        _run(conn, lambda: create_budget(1, 100.0))
        _tx(conn, "2026-07", -20.0, 2)            # child, counts
        _tx(conn, "2026-07", -10.0, 3)            # child, counts
        _tx(conn, "2026-08", -50.0, 2)            # other month, not counted
        _tx(conn, "2026-07", 500.0, 1)            # income, not counted
        _tx(conn, "2026-07", -30.0, 1, refund_total=10.0)  # net -20

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert len(result) == 1
        assert result[0]["category_id"] == 1
        assert result[0]["name"] == "Freizeit"
        assert result[0]["icon"] == "🎉"
        assert result[0]["spent"] == 50.0
        assert result[0]["remaining"] == 50.0
        assert result[0]["is_over"] is False

    def test_is_over_when_spent_exceeds_budget(self):
        conn = _make_db()
        _run(conn, lambda: create_budget(2, 50.0))
        _tx(conn, "2026-07", -60.0, 2)

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert result[0]["spent"] == 60.0
        assert result[0]["remaining"] == -10.0
        assert result[0]["is_over"] is True

    def test_uncategorized_transactions_not_counted(self):
        conn = _make_db()
        _run(conn, lambda: create_budget(2, 50.0))
        _tx(conn, "2026-07", -30.0, None)

        result = _run(conn, lambda: list_budgets("2026-07"))

        assert result[0]["spent"] == 0.0


class TestCreateBudget:
    def test_duplicate_category_raises(self):
        conn = _make_db()
        _run(conn, lambda: create_budget(1, 100.0))

        with pytest.raises(ValueError, match="existiert bereits"):
            _run(conn, lambda: create_budget(1, 50.0))

    def test_rejects_income_category(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="Ausgabe-Kategorie"):
            _run(conn, lambda: create_budget(4, 100.0))

    def test_rejects_unknown_category(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="Ausgabe-Kategorie"):
            _run(conn, lambda: create_budget(999, 100.0))

    def test_rejects_negative_amount(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="negativ"):
            _run(conn, lambda: create_budget(1, -5.0))

    def test_create_then_list(self):
        conn = _make_db()
        _run(conn, lambda: create_budget(2, 40.0))

        rows = conn.execute("SELECT * FROM budgets").fetchall()
        assert len(rows) == 1
        assert rows[0]["category_id"] == 2
        assert rows[0]["monthly_amount"] == 40.0


class TestUpdateBudget:
    def test_updates_amount(self):
        conn = _make_db()
        _run(conn, lambda: create_budget(2, 40.0))
        bid = conn.execute("SELECT id FROM budgets").fetchone()["id"]

        result = _run(conn, lambda: update_budget(bid, 60.0))

        assert result is not None
        assert result["monthly_amount"] == 60.0

    def test_missing_budget_returns_none(self):
        conn = _make_db()

        assert _run(conn, lambda: update_budget(123, 60.0)) is None


class TestDeleteBudget:
    def test_deletes(self):
        conn = _make_db()
        _run(conn, lambda: create_budget(2, 40.0))
        bid = conn.execute("SELECT id FROM budgets").fetchone()["id"]

        assert _run(conn, lambda: delete_budget(bid)) is True
        assert conn.execute("SELECT COUNT(*) FROM budgets").fetchone()[0] == 0

    def test_missing_returns_false(self):
        conn = _make_db()

        assert _run(conn, lambda: delete_budget(123)) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `backend/`): `.venv/bin/python -m pytest tests/test_budgets.py -v`
Expected: FAIL mit `ModuleNotFoundError: No module named 'finance_server.db.budgets'`.

- [ ] **Step 3: Write minimal implementation**

Neu erstellen `backend/finance_server/db/budgets.py`:

```python
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection
from finance_server.services.sync_logger import log_crud_event


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _validate_amount(monthly_amount: float) -> None:
    if monthly_amount is None or monthly_amount < 0:
        raise ValueError("Budget darf nicht negativ sein.")


def _fetch_spent(conn: Any, category_id: int, month: str) -> float:
    row = conn.execute(
        """
        WITH RECURSIVE cat_tree(cat_id) AS (
            SELECT ?
            UNION ALL
            SELECT c.id FROM kategorien c JOIN cat_tree t ON c.parent_id = t.cat_id
        )
        SELECT COALESCE(SUM(-(u.amount + COALESCE(u.refund_total, 0))), 0) AS spent
        FROM umsaetze u
        WHERE u.kategorie IN (SELECT cat_id FROM cat_tree)
          AND u.amount < 0
          AND strftime('%Y-%m', COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10))) = ?
        """,
        (category_id, month),
    ).fetchone()
    return float(row["spent"])


def _serialize_budget(row: Any, spent: float) -> dict[str, Any]:
    monthly = float(row["monthly_amount"])
    return {
        "id": row["id"],
        "category_id": row["category_id"],
        "name": row["name"],
        "icon": row["icon"],
        "monthly_amount": round(monthly, 2),
        "spent": round(spent, 2),
        "remaining": round(monthly - spent, 2),
        "is_over": spent > monthly,
    }


def _get_budget(budget_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM budgets WHERE id = ?", (budget_id,)
        ).fetchone()
    return dict(row) if row else None


def list_budgets(month: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT b.id, b.category_id, b.monthly_amount, k.name, k.icon
            FROM budgets b
            JOIN kategorien k ON k.id = b.category_id
            ORDER BY k.name ASC
            """,
        ).fetchall()
        return [_serialize_budget(row, _fetch_spent(conn, row["category_id"], month)) for row in rows]


def create_budget(category_id: int, monthly_amount: float) -> dict[str, Any]:
    _validate_amount(monthly_amount)
    with get_connection() as conn:
        cat = conn.execute(
            "SELECT id FROM kategorien WHERE id = ? AND typ = 'Ausgabe'",
            (category_id,),
        ).fetchone()
        if cat is None:
            raise ValueError("Kategorie nicht gefunden oder keine Ausgabe-Kategorie.")
        try:
            cursor = conn.execute(
                "INSERT INTO budgets (category_id, monthly_amount) VALUES (?, ?)",
                (category_id, monthly_amount),
            )
        except sqlite3.IntegrityError as err:
            raise ValueError("Budget existiert bereits für diese Kategorie.") from err
        budget_id = int(cursor.lastrowid)
    result = _get_budget(budget_id)
    if result:
        log_crud_event("budgets", budget_id, "INSERT", result)
    return result


def update_budget(budget_id: int, monthly_amount: float) -> dict[str, Any] | None:
    _validate_amount(monthly_amount)
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE budgets SET monthly_amount = ?, updated_at = ? WHERE id = ?",
            (monthly_amount, _now(), budget_id),
        )
        if cursor.rowcount <= 0:
            return None
    result = _get_budget(budget_id)
    if result:
        log_crud_event("budgets", budget_id, "UPDATE", result)
    return result


def delete_budget(budget_id: int) -> bool:
    budget = _get_budget(budget_id)
    if budget:
        log_crud_event("budgets", budget_id, "DELETE", budget)
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
    return cursor.rowcount > 0
```

- [ ] **Step 4: Run test to verify it passes**

Run (in `backend/`): `.venv/bin/python -m pytest tests/test_budgets.py -v`
Expected: PASS (alle Tests).

- [ ] **Step 5: Ruff + Commit**

```bash
cd backend && .venv/bin/python -m ruff check finance_server/db/budgets.py tests/test_budgets.py
git add backend/finance_server/db/budgets.py backend/tests/test_budgets.py
git commit -m "feat(budgets): add budget CRUD and spent calculation"
```

---

### Task 3: Backend — API (`models/budget.py`, `api/budgets.py`, Router-Wiring)

**Files:**
- Create: `backend/finance_server/models/budget.py`
- Create: `backend/finance_server/api/budgets.py`
- Modify: `backend/finance_server/main.py`

**Interfaces:**
- Consumes: `db.budgets` Funktionen aus Task 2.
- Produces: Router `budgets_router` (importierbar als `from finance_server.api.budgets import router as budgets_router`), Endpunkte:
  - `GET /api/db/budgets?month=YYYY-MM` → `{"budgets": [...]}`
  - `POST /api/db/budgets` Body `{"category_id": int, "monthly_amount": float}`
  - `PUT /api/db/budgets/{budget_id}` Body `{"monthly_amount": float}`
  - `DELETE /api/db/budgets/{budget_id}`

- [ ] **Step 1: Write models**

Neu erstellen `backend/finance_server/models/budget.py`:

```python
from __future__ import annotations

from pydantic import BaseModel


class BudgetCreateRequest(BaseModel):
    category_id: int
    monthly_amount: float


class BudgetUpdateRequest(BaseModel):
    monthly_amount: float
```

- [ ] **Step 2: Write API router**

Neu erstellen `backend/finance_server/api/budgets.py` (Muster wie `api/analytics.py` — direkte db-Aufrufe, keine Service-Schicht):

```python
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from finance_server.db.budgets import (
    create_budget,
    delete_budget,
    list_budgets,
    update_budget,
)

router = APIRouter()


@router.get("/db/budgets")
def get_budgets(month: str = Query(...)) -> dict[str, Any]:
    return {"budgets": list_budgets(month)}


@router.post("/db/budgets")
def create_budget_endpoint(request: BudgetCreateRequest) -> dict[str, Any]:
    try:
        return create_budget(request.category_id, request.monthly_amount)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/db/budgets/{budget_id}")
def update_budget_endpoint(budget_id: int, request: BudgetUpdateRequest) -> dict[str, Any]:
    result = update_budget(budget_id, request.monthly_amount)
    if result is None:
        raise HTTPException(status_code=404, detail="Budget nicht gefunden")
    return result


@router.delete("/db/budgets/{budget_id}")
def delete_budget_endpoint(budget_id: int) -> dict[str, Any]:
    if not delete_budget(budget_id):
        raise HTTPException(status_code=404, detail="Budget nicht gefunden")
    return {"deleted": True}
```

- [ ] **Step 3: Wire router in main.py**

In `backend/finance_server/main.py`:
- Import nach Zeile 23 (`from finance_server.api.sync import router as sync_router`):

```python
from finance_server.api.budgets import router as budgets_router
```

- `include_router` nach Zeile 84 (`app.include_router(sync_router, prefix="/api")`):

```python
app.include_router(budgets_router, prefix="/api")
```

- [ ] **Step 4: Verify import + all backend tests**

```bash
cd backend
.venv/bin/python -c "from finance_server.api.budgets import router; from finance_server.main import app; print('ok')"
.venv/bin/python -m ruff check finance_server/api/budgets.py finance_server/models/budget.py finance_server/main.py
.venv/bin/python -m pytest tests/ -q
```
Expected: `ok`, ruff grün, alle Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/models/budget.py backend/finance_server/api/budgets.py backend/finance_server/main.py
git commit -m "feat(budgets): add budgets REST API"
```

---

### Task 4: Frontend — `lib/budgets.ts` + Progress-Farben

**Files:**
- Create: `frontend/src/lib/budgets.ts`
- Modify: `frontend/src/components/ui/progress.tsx`

**Interfaces:**
- Produces:
  - `type Budget = { id: number; category_id: number; name: string; icon: string | null; monthly_amount: number; spent: number; remaining: number; is_over: boolean }`
  - `fetchBudgets(month: string): Promise<Budget[]>`
  - `createBudget(category_id: number, monthly_amount: number): Promise<Budget>`
  - `updateBudget(budgetId: number, monthly_amount: number): Promise<Budget>`
  - `deleteBudget(budgetId: number): Promise<void>`
  - `Progress` bekommt optionale Prop `indicatorClassName?: string`.

- [ ] **Step 1: Write lib module**

Neu erstellen `frontend/src/lib/budgets.ts` (Muster wie `lib/allocation.ts`):

```ts
import { getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

export type Budget = {
  id: number;
  category_id: number;
  name: string;
  icon: string | null;
  monthly_amount: number;
  spent: number;
  remaining: number;
  is_over: boolean;
};

export async function fetchBudgets(month: string): Promise<Budget[]> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets?month=${month}`);
  const data = await parseJsonResponse(response);
  return data.budgets ?? [];
}

export async function createBudget(category_id: number, monthly_amount: number): Promise<Budget> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id, monthly_amount }),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function updateBudget(budgetId: number, monthly_amount: number): Promise<Budget> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets/${budgetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthly_amount }),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function deleteBudget(budgetId: number): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets/${budgetId}`, {
    method: "DELETE",
  });
  await parseJsonResponse(response);
  await emitReferenceChange();
}
```

Prüfen: `getApiBaseUrl`/`parseJsonResponse` sind in `lib/api` exportiert (siehe `lib/allocation.ts:1`), `emitReferenceChange` in `lib/events`.

- [ ] **Step 2: Extend Progress component**

In `frontend/src/components/ui/progress.tsx` das `motion.div` farbbar machen:

```tsx
function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  return (
    <div
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <motion.div
        className={cn("h-full w-full rounded-full bg-primary", indicatorClassName)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + Commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/lib/budgets.ts frontend/src/components/ui/progress.tsx
git commit -m "feat(budgets): add frontend budgets API client and colored progress"
```

---

### Task 5: Frontend — Budgets-Seite

**Files:**
- Create: `frontend/src/pages/budgets/budgets-page.tsx`

**Interfaces:**
- Consumes: `lib/budgets.ts` (Task 4), `fetchCategories` aus `lib/categories/api.ts`, `formatAmount` aus `lib/utils/format`, UI-Komponenten aus `components/ui/*`.
- Produces: Default-Export `BudgetsPage` mit Monats-Navigation, Header-Karte, Budget-Karten, Hinzufügen-Dialog.

- [ ] **Step 1: Write the page**

Neu erstellen `frontend/src/pages/budgets/budgets-page.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchBudgets, createBudget, updateBudget, deleteBudget, type Budget } from "@/lib/budgets";
import { fetchCategories } from "@/lib/categories/api";
import type { FinanceCategory } from "@/lib/categories/types";
import { formatAmount } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function BudgetRow({
  budget,
  onUpdate,
  onDelete,
}: {
  budget: Budget;
  onUpdate: (id: number, amount: number) => void;
  onDelete: (id: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ratio = budget.monthly_amount > 0 ? budget.spent / budget.monthly_amount : budget.spent > 0 ? 1 : 0;
  const color = ratio >= 1 ? "bg-red-500" : ratio >= 0.7 ? "bg-amber-500" : "bg-emerald-500";

  const commit = () => {
    if (draft == null) return;
    const value = Number(draft.replace(",", "."));
    if (Number.isFinite(value) && value >= 0 && value !== budget.monthly_amount) {
      void onUpdate(budget.id, value);
    }
    setDraft(null);
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <span className="text-2xl">{budget.icon ?? "🏷️"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{budget.name}</p>
            <div className="flex shrink-0 items-center gap-1">
              <Input
                type="number"
                aria-label={`Budget für ${budget.name}`}
                value={draft ?? budget.monthly_amount}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                }}
                className="h-7 w-24 text-right text-sm tabular-nums"
              />
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onDelete(budget.id)} aria-label={`Budget für ${budget.name} löschen`}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          <Progress value={ratio * 100} indicatorClassName={color} className="mt-2" />
          <p className="mt-1 text-xs text-muted-foreground">
            {formatAmount(budget.spent)} ausgegeben ·{" "}
            <span className={budget.remaining < 0 ? "text-red-600 dark:text-red-400" : ""}>
              {formatAmount(budget.remaining)} übrig
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AddBudgetDialog({
  open,
  onOpenChange,
  categories,
  existingCategoryIds,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: FinanceCategory[];
  existingCategoryIds: Set<number>;
  onCreate: (categoryId: number, amount: number) => void;
}) {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const available = categories.filter((c) => !existingCategoryIds.has(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Budget hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {available.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                categoryId === c.id ? "border-primary bg-primary/10" : "hover:bg-muted",
              )}
            >
              <span>{c.icon ?? "🏷️"}</span>
              <span className="truncate">{c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}</span>
            </button>
          ))}
          {available.length === 0 && (
            <p className="text-sm text-muted-foreground">Alle Ausgabe-Kategorien haben bereits ein Budget.</p>
          )}
        </div>
        <Input
          type="number"
          min={0}
          placeholder="Monatsbudget in €"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && categoryId != null && Number(amount) > 0) {
              void onCreate(categoryId, Number(amount));
              setCategoryId(null);
              setAmount("");
              onOpenChange(false);
            }
          }}
        />
        <DialogFooter>
          <Button
            disabled={categoryId == null || !(Number(amount) > 0)}
            onClick={() => {
              if (categoryId == null) return;
              void onCreate(categoryId, Number(amount));
              setCategoryId(null);
              setAmount("");
              onOpenChange(false);
            }}
          >
            Hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgetRows, cats] = await Promise.all([fetchBudgets(month), fetchCategories()]);
      setBudgets(budgetRows);
      setCategories(cats.filter((c) => c.typ === "Ausgabe"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(
    () => ({
      budget: budgets.reduce((sum, b) => sum + b.monthly_amount, 0),
      spent: budgets.reduce((sum, b) => sum + b.spent, 0),
      remaining: budgets.reduce((sum, b) => sum + b.remaining, 0),
    }),
    [budgets],
  );

  const handleCreate = useCallback(
    async (categoryId: number, amount: number) => {
      try {
        await createBudget(categoryId, amount);
        toast.success("Budget angelegt");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    },
    [load],
  );

  const handleUpdate = useCallback(
    async (id: number, amount: number) => {
      try {
        await updateBudget(id, amount);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    },
    [load],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteBudget(id);
        toast.success("Budget gelöscht");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    },
    [load],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 py-6">
      <Card className="border-none bg-muted/40 shadow-none">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Vorheriger Monat">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-24 text-center font-medium tabular-nums">{month}</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Nächster Monat">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm">
            <div>
              <p className="text-muted-foreground">Budget</p>
              <p className="font-semibold tabular-nums">{formatAmount(totals.budget)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Ausgegeben</p>
              <p className="font-semibold tabular-nums">{formatAmount(totals.spent)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Übrig</p>
              <p className="font-semibold tabular-nums">{formatAmount(totals.remaining)}</p>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
              <Plus /> Budget hinzufügen
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <EmptyState title="Budgets konnten nicht geladen werden" text={error} />
      ) : budgets.length === 0 ? (
        <EmptyState
          title="Keine Budgets"
          text="Lege ein Budget für eine Kategorie an, um deine monatlichen Ausgaben im Blick zu behalten."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {budgets.map((b) => (
            <BudgetRow key={b.id} budget={b} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <AddBudgetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        existingCategoryIds={new Set(budgets.map((b) => b.category_id))}
        onCreate={handleCreate}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/pages/budgets/budgets-page.tsx
git commit -m "feat(budgets): add budgets page"
```

---

### Task 6: Frontend — Routing, Sidebar-Badge, Breadcrumb

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/layouts/app-sidebar.tsx`
- Modify: `frontend/src/components/nav-main.tsx`
- Modify: `frontend/src/layouts/breadcrumb.tsx`

**Interfaces:**
- Consumes: `fetchBudgets` (Task 4), `BudgetsPage` (Task 5).
- Produces: Route `/budgets`, Sidebar-Eintrag "Budgets" mit Icon `Target` und rotem Badge (Anzahl überzogener Budgets im aktuellen Monat).

- [ ] **Step 1: Add route**

In `frontend/src/App.tsx`:
- Lazy-Import nach Zeile 16 (`const AllocationPage = ...`):

```tsx
const BudgetsPage = lazy(() => import("@/pages/budgets/budgets-page"));
```

- Route nach Zeile 60:

```tsx
<Route path="/budgets" element={<ErrorBoundary pageName="Budgets"><BudgetsPage /></ErrorBoundary>} />
```

- [ ] **Step 2: Add breadcrumb title**

In `frontend/src/layouts/breadcrumb.tsx`, im `titles`-Objekt (Zeile 100–107) ergänzen:

```ts
budgets: "Budgets",
```

- [ ] **Step 3: Add badge support to NavMain**

In `frontend/src/components/nav-main.tsx`:
- Item-Typ erweitern (Zeile 23–32):

```tsx
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    badge?: number;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
```

- Im `!hasChildren`-Zweig, nach `<span>{item.title}</span>` **in beiden** Branches (aktiv, Zeile 57, und Link, Zeile 62) einfügen:

```tsx
{item.badge != null && item.badge > 0 && (
  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
    {item.badge}
  </span>
)}
```

- [ ] **Step 4: Add sidebar entry + badge fetch**

In `frontend/src/layouts/app-sidebar.tsx`:
- Imports anpassen (Zeile 2 und nach Zeile 16):

```tsx
import { FileText, Gauge, Repeat, ScanSearch, Target, Wallet } from "lucide-react";
```
```tsx
import { fetchBudgets } from "@/lib/budgets";
```

- Modul-`navData` (Zeile 21–50) löschen und im Component-Body (vor `return`) neu aufbauen; das Component bekommt State + Callback:

```tsx
  const [overBudgetCount, setOverBudgetCount] = React.useState(0);

  const refreshOverBudget = React.useCallback(async () => {
    try {
      const d = new Date();
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const rows = await fetchBudgets(month);
      setOverBudgetCount(rows.filter((b) => b.is_over).length);
    } catch {
      setOverBudgetCount(0);
    }
  }, []);

  const navData = {
    navMain: [
      { title: "Dashboard", url: "/dashboard", icon: Gauge },
      { title: "Transaktionen", url: "/transactions", icon: FileText },
      { title: "Abonnements", url: "/subscriptions", icon: Repeat },
      { title: "Analyse", url: "/analytics", icon: ScanSearch },
      { title: "Finanzplan", url: "/finance-plan", icon: Wallet },
      { title: "Budgets", url: "/budgets", icon: Target, badge: overBudgetCount },
    ],
  };
```

- Im Mount-`useEffect` (nach `void updateCacheAge();`) einfügen:

```tsx
    void refreshOverBudget();
```

- Im `handleRefresh`-Callback (Zeile 187–190) einfügen:

```tsx
      void refreshOverBudget();
```

- Die Dependency-Liste des Mount-`useEffect` um `refreshOverBudget` ergänzen (Zeile ~228, sonst warnt `eslint-plugin-react-hooks`):

```tsx
  }, [updateCacheAge, refreshOverBudget]);
```

- [ ] **Step 5: Typecheck + build + Commit**

```bash
cd frontend && npx tsc --noEmit && pnpm build
git add frontend/src/App.tsx frontend/src/layouts/app-sidebar.tsx frontend/src/components/nav-main.tsx frontend/src/layouts/breadcrumb.tsx
git commit -m "feat(budgets): wire budgets route, sidebar entry and over-budget badge"
```

---

### Task 7: End-to-End-Verifikation

**Files:** keine (nur Verifikation).

- [ ] **Step 1: Backend-Tests komplett**

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```
Expected: alle PASS.

- [ ] **Step 2: Backend-Lint**

```bash
cd backend && .venv/bin/python -m ruff check finance_server/ tests/
```
Expected: keine Fehler.

- [ ] **Step 3: Frontend-Typecheck + Build**

```bash
cd frontend && npx tsc --noEmit && pnpm build
```
Expected: keine Fehler.

- [ ] **Step 4: Manueller Smoke-Test**

1. Backend starten: `pnpm --dir backend start:dev` (Port 8112) oder über `pnpm dev`.
2. Frontend starten: `pnpm --dir frontend dev`.
3. Sidebar: "Budgets" sichtbar, kein Badge initial.
4. Budget anlegen (z.B. Kategorie "Essen & Trinken / Lebensmittel", 100 €) → Karte erscheint, Balken grün.
5. Betrag ändern (Blur/Enter) → persistiert (Reload prüfen).
6. Ausgabe im aktuellen Monat kategorisieren, Betrag unter Budget setzen, um rotes Überziehen zu testen → Badge erscheint in Sidebar, Balken rot.
7. Monat zurück blättern → Ausgaben dieses Monats zählen nicht.
8. Budget löschen → Karte verschwindet.

- [ ] **Step 5: Final commit (falls Smoke-Test Fixes nötig waren)**

```bash
git add -A && git commit -m "feat(budgets): fix review findings"
```
Nur ausführen, wenn Step 4 Änderungen ergeben hat; sonst überspringen.
