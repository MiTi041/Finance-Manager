# Jährliche Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monatsbudgets um einen eigenen Budgettyp `period='yearly'` erweitern, dessen Ausgaben YTD (bis zum selektierten Monat) gegen ein Jahresziel laufen.

**Architecture:** Eine Tabelle `budgets` bleibt, bekommt `amount` (statt `monthly_amount`) und `period`. Die Spent-Berechnung wird period-abhängig; die Kategorie-Exklusivität gilt nur innerhalb desselben Period-Typs. Frontend: Budget-Typ `period`, Dialoge mit Monat/Jahr-Umschalter, Karten-Badge „Jahr", alles im selben Raster.

**Tech Stack:** Python/FastAPI/sqlite3 (backend), React/TypeScript/Tailwind (frontend).

## Global Constraints

- Deutsche UI-Texte (Bestehende Strings übernehmen, z.B. „Budget ist bereits in einem anderen Budget.").
- `period` Werte sind exakt `'monthly'` | `'yearly'`, Default `'monthly'`.
- Kategorie-Exklusivität **pro Period**: gleiche Kategorie in einem Monats- UND einem Jahresbudget erlaubt, nicht in zwei gleichen Period-Typen.
- Jährliche Spent = YTD: `strftime('%Y', …) = :year AND Monat <= :month` des selektierten Monats.
- Spent-Logik refund-bereinigt (`u.amount + COALESCE(u.refund_total, 0)`, nur `u.amount < 0`) unverändert.
- Backend-Tests: `cd backend && .venv/bin/pytest` (venv existiert).
- Frontend-Check: `pnpm --dir frontend build` und `pnpm --dir frontend exec tsc --noEmit`.

---

### Task 1: Backend-Schema-Migration + Sync-Registry

**Files:**
- Modify: `backend/finance_server/core/schema.py:400-435` (`create_budgets_table`)
- Modify: `backend/finance_server/db/sync.py:112`
- Test: `backend/tests/test_schema.py`

**Interfaces:**
- Consumes: `initialize_database` ruft `create_budgets_table(connection)` bereits auf; `_ensure_table_columns(connection, table, {col: ddl})` existiert.
- Produces: `budgets`-Tabelle mit Spalten `{id, name, category_ids, amount, period, created_at, updated_at}`; Migration konvertiert bestehende `monthly_amount`-Zeilen zu `amount` + `period='monthly'`.

- [ ] **Step 1: Test-Setup an neue Spalten anpassen (failing)**

In `backend/tests/test_schema.py` die Assertions auf `amount`/`period` umstellen und den Migrations-Test erweitern:

```python
def test_initialize_database_creates_budgets_table():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    initialize_database(conn)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(budgets)")}
    assert {"id", "category_ids", "amount", "period", "created_at", "updated_at"} <= cols
    conn.close()


def test_initialize_database_migrates_legacy_budgets():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE budgets (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id    INTEGER NOT NULL UNIQUE,
            monthly_amount REAL NOT NULL,
            created_at     TEXT,
            updated_at     TEXT
        )
        """
    )
    conn.execute("INSERT INTO budgets (category_id, monthly_amount) VALUES (?, ?)", (7, 50.0))
    initialize_database(conn)
    row = conn.execute("SELECT category_ids, amount, period FROM budgets").fetchone()
    assert row["category_ids"] == "[7]"
    assert row["amount"] == 50.0
    assert row["period"] == "monthly"
    conn.close()


def test_initialize_database_migrates_current_budgets_monthly_amount():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE budgets (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL DEFAULT '',
            category_ids   TEXT NOT NULL,
            monthly_amount REAL NOT NULL,
            created_at     TEXT,
            updated_at     TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO budgets (name, category_ids, monthly_amount) VALUES (?, ?, ?)",
        ("Test", "[1, 2]", 120.0),
    )
    initialize_database(conn)
    row = conn.execute("SELECT category_ids, amount, period FROM budgets").fetchone()
    assert row["category_ids"] == "[1, 2]"
    assert row["amount"] == 120.0
    assert row["period"] == "monthly"
    conn.close()
```

- [ ] **Step 2: Test läuft und scheitert**

Run: `cd backend && .venv/bin/pytest tests/test_schema.py -v`
Expected: FAIL — `monthly_amount`/`period` fehlen bzw. `amount` existiert nicht.

- [ ] **Step 3: Schema implementieren**

`backend/finance_server/core/schema.py` — `create_budgets_table` vollständig ersetzen:

```python
def create_budgets_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL DEFAULT '',
            category_ids   TEXT NOT NULL,
            amount         REAL NOT NULL CHECK(amount >= 0),
            period         TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly', 'yearly')),
            created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    _ensure_table_columns(
        connection,
        "budgets",
        {"name": "TEXT NOT NULL DEFAULT ''", "period": "TEXT NOT NULL DEFAULT 'monthly'"},
    )
    existing = {row[1] for row in connection.execute("PRAGMA table_info(budgets)")}
    if "category_id" in existing or "monthly_amount" in existing:
        connection.execute("ALTER TABLE budgets RENAME TO budgets_old")
        connection.execute("""
            CREATE TABLE budgets (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                name           TEXT NOT NULL DEFAULT '',
                category_ids   TEXT NOT NULL,
                amount         REAL NOT NULL CHECK(amount >= 0),
                period         TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly', 'yearly')),
                created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        old_cols = {row[1] for row in connection.execute("PRAGMA table_info(budgets_old)")}
        cat_expr = "'[' || category_id || ']'" if "category_id" in old_cols else "category_ids"
        connection.execute(
            f"""
            INSERT INTO budgets (id, category_ids, amount, period, created_at, updated_at)
            SELECT id, {cat_expr}, monthly_amount, 'monthly',
                   COALESCE(created_at, CURRENT_TIMESTAMP), COALESCE(updated_at, CURRENT_TIMESTAMP)
            FROM budgets_old
            """
        )
        connection.execute("DROP TABLE budgets_old")
```

- [ ] **Step 4: Sync-Registry anpassen**

`backend/finance_server/db/sync.py:112`:

```python
"budgets": {"id", "name", "category_ids", "amount", "period", "created_at", "updated_at"},
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd backend && .venv/bin/pytest tests/test_schema.py -v`
Expected: PASS (alle 3 Tests; die übrigen Schema-Tests weiterhin grün).

- [ ] **Step 6: Commit**

```bash
git add backend/finance_server/core/schema.py backend/finance_server/db/sync.py backend/tests/test_schema.py
git commit -m "feat(budgets): add period and amount columns to budgets schema"
```

---

### Task 2: Backend-DB-Layer period-aware (Spent, CRUD, Validierung)

**Files:**
- Modify: `backend/finance_server/db/budgets.py`
- Modify: `backend/finance_server/models/budget.py`
- Modify: `backend/finance_server/api/budgets.py`
- Test: `backend/tests/test_budgets.py`

**Interfaces:**
- Consumes: Task 1 Schema (`amount`, `period`); bestehende Test-Helfer `_make_db`, `_tx`, `_run` in `test_budgets.py`.
- Produces:
  - `create_budget(name: str, category_ids: list[int], amount: float, period: str = "monthly") -> dict[str, Any]`
  - `update_budget(budget_id, name=None, category_ids=None, amount=None, period=None) -> dict[str, Any] | None`
  - `list_budgets(month: str) -> list[dict]` — Response-Felder `amount`, `period` statt `monthly_amount`.
  - `_validate_period(period: str) -> str` (wirft `ValueError("Ungültiger Zeitraum. Nur 'monthly' oder 'yearly' erlaubt.")`)
  - `_validate_categories(conn, category_ids, exclude_budget_id=None, period="monthly") -> list[int]`
  - API: `POST/PUT /db/budgets` erwarten `{name, category_ids, amount, period}`.

- [ ] **Step 1: Test-Fixture + Feldnamen aktualisieren (failing)**

`backend/tests/test_budgets.py`:

a) In `_make_db()` die `budgets`-Tabelle ersetzen:

```sql
        CREATE TABLE budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            category_ids TEXT NOT NULL,
            amount REAL NOT NULL,
            period TEXT NOT NULL DEFAULT 'monthly',
            created_at TEXT,
            updated_at TEXT
        );
```

b) `test_create_then_list`: `assert rows[0]["monthly_amount"] == 40.0` → `assert rows[0]["amount"] == 40.0` und zusätzlich `assert rows[0]["period"] == "monthly"`.

c) `TestUpdateBudget.test_updates_amount`: `update_budget(bid, monthly_amount=60.0)` → `update_budget(bid, amount=60.0)`, Assertion `result["monthly_amount"]` → `result["amount"]`.

d) Neue Testklasse ans Ende der Datei:

```python
class TestYearlyBudgets:
    def test_yearly_spent_is_ytd_up_to_selected_month(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Versicherung", [1], 600.0, period="yearly"))
        _tx(conn, "2026-01", -100.0, 2)
        _tx(conn, "2026-07", -200.0, 2)
        _tx(conn, "2026-08", -300.0, 2)  # nach dem Stichtag, zählt nicht

        july = _run(conn, lambda: list_budgets("2026-07"))
        assert july[0]["period"] == "yearly"
        assert july[0]["spent"] == 300.0
        assert july[0]["remaining"] == 300.0
        assert july[0]["is_over"] is False

        august = _run(conn, lambda: list_budgets("2026-08"))
        assert august[0]["spent"] == 600.0
        assert august[0]["is_over"] is True

    def test_yearly_ignores_income_and_previous_year(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [1], 100.0, period="yearly"))
        _tx(conn, "2025-12", -50.0, 2)
        _tx(conn, "2026-01", -20.0, 2)
        _tx(conn, "2026-03", 500.0, 2)  # income, zählt nicht
        _tx(conn, "2026-03", -30.0, 2, refund_total=10.0)  # netto -20

        result = _run(conn, lambda: list_budgets("2026-03"))
        assert result[0]["spent"] == 40.0

    def test_same_category_allowed_in_monthly_and_yearly(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Monatlich", [1], 50.0, period="monthly"))
        yearly = _run(conn, lambda: create_budget("Jährlich", [1], 600.0, period="yearly"))
        assert yearly["period"] == "yearly"
        assert len(_run(conn, lambda: list_budgets("2026-07"))) == 2

    def test_same_category_twice_in_same_period_raises(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Monatlich", [1], 50.0, period="monthly"))
        _run(conn, lambda: create_budget("Jährlich", [1], 600.0, period="yearly"))

        with pytest.raises(ValueError, match="bereits in einem anderen Budget"):
            _run(conn, lambda: create_budget("NochMonat", [1], 50.0, period="monthly"))

    def test_rejects_invalid_period(self):
        conn = _make_db()

        with pytest.raises(ValueError, match="Zeitraum"):
            _run(conn, lambda: create_budget("Test", [1], 100.0, period="weekly"))

    def test_update_can_change_period(self):
        conn = _make_db()
        _run(conn, lambda: create_budget("Test", [1], 50.0))
        bid = conn.execute("SELECT id FROM budgets").fetchone()["id"]

        result = _run(conn, lambda: update_budget(bid, period="yearly", amount=600.0))
        assert result["period"] == "yearly"
        assert result["amount"] == 600.0
```

- [ ] **Step 2: Test läuft und scheitert**

Run: `cd backend && .venv/bin/pytest tests/test_budgets.py -v`
Expected: FAIL — `period`/`amount`/`monthly_amount`-Missmatch, `create_budget` kennt kein `period`.

- [ ] **Step 3: DB-Layer umbauen**

`backend/finance_server/db/budgets.py`:

a) Am Modulanfang (nach `_current_month`) hinzufügen:

```python
def _validate_period(period: str) -> str:
    if period not in {"monthly", "yearly"}:
        raise ValueError("Ungültiger Zeitraum. Nur 'monthly' oder 'yearly' erlaubt.")
    return period
```

b) `_validate_amount` Parameter umbenennen:

```python
def _validate_amount(amount: float) -> None:
    if amount is None or amount < 0:
        raise ValueError("Budget darf nicht negativ sein.")
```

c) `_fetch_spent` period-abhängig machen:

```python
def _fetch_spent(conn: Any, category_ids: list[int], month: str, period: str) -> float:
    date_expr = "COALESCE(u.entry_date, u.date, substr(u.created_at, 1, 10))"
    if period == "yearly":
        where = (
            f"strftime('%Y', {date_expr}) = ? "
            f"AND CAST(strftime('%m', {date_expr}) AS INTEGER) <= ?"
        )
        params: tuple[Any, ...] = (json.dumps(category_ids), month[:4], int(month[5:]))
    else:
        where = f"strftime('%Y-%m', {date_expr}) = ?"
        params = (json.dumps(category_ids), month)
    row = conn.execute(
        f"""
        WITH RECURSIVE cat_tree(cat_id) AS (
            SELECT value FROM json_each(?)
            UNION
            SELECT c.id FROM kategorien c JOIN cat_tree t ON c.parent_id = t.cat_id
        )
        SELECT COALESCE(SUM(-(u.amount + COALESCE(u.refund_total, 0))), 0) AS spent
        FROM umsaetze u
        WHERE u.kategorie IN (SELECT cat_id FROM cat_tree)
          AND u.amount < 0
          AND {where}
        """,
        params,
    ).fetchone()
    return float(row["spent"])
```

d) `_serialize_budget` auf `amount`/`period`:

```python
def _serialize_budget(row: Any, spent: float, cats: list[dict[str, Any]]) -> dict[str, Any]:
    amount = float(row["amount"])
    spent_r = round(spent, 2)
    amount_r = round(amount, 2)
    return {
        "id": row["id"],
        "name": row["name"] or " + ".join(c["name"] for c in cats),
        "category_ids": _parse_category_ids(row["category_ids"]),
        "categories": [{"name": c["name"], "icon": c["icon"]} for c in cats],
        "amount": amount_r,
        "period": row["period"],
        "spent": spent_r,
        "remaining": round(amount_r - spent_r, 2),
        "is_over": spent_r > amount_r,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
```

e) `_get_budget` und `list_budgets`: SELECT auf `id, name, category_ids, amount, period, created_at, updated_at`; `_fetch_spent(conn, category_ids, month, row["period"])` (in `_get_budget` mit `_current_month()`).

f) `_validate_categories` mit period-Parameter:

```python
def _validate_categories(
    conn: Any, category_ids: list[int], exclude_budget_id: int | None = None, period: str = "monthly"
) -> list[int]:
    category_ids = sorted(set(int(i) for i in category_ids))
    if not category_ids:
        raise ValueError("Mindestens eine Kategorie auswählen.")
    placeholders = ",".join("?" * len(category_ids))
    cats = conn.execute(
        f"SELECT id FROM kategorien WHERE id IN ({placeholders}) AND typ = 'Ausgabe'",
        category_ids,
    ).fetchall()
    if {c["id"] for c in cats} != set(category_ids):
        raise ValueError("Kategorie nicht gefunden oder keine Ausgabe-Kategorie.")
    used: set[int] = set()
    for r in conn.execute("SELECT id, category_ids, period FROM budgets").fetchall():
        if r["id"] == exclude_budget_id or r["period"] != period:
            continue
        used.update(_parse_category_ids(r["category_ids"]))
    if used & set(category_ids):
        raise ValueError("Kategorie ist bereits in einem anderen Budget.")
    return category_ids
```

g) `create_budget`:

```python
def create_budget(name: str, category_ids: list[int], amount: float, period: str = "monthly") -> dict[str, Any]:
    name = _validate_name(name)
    _validate_amount(amount)
    period = _validate_period(period)
    with get_connection() as conn:
        category_ids = _validate_categories(conn, category_ids, period=period)
        cursor = conn.execute(
            "INSERT INTO budgets (name, category_ids, amount, period) VALUES (?, ?, ?, ?)",
            (name, json.dumps(category_ids), amount, period),
        )
        budget_id = int(cursor.lastrowid)
    result = _get_budget(budget_id)
    if result:
        log_crud_event("budgets", budget_id, "INSERT", result)
    return result
```

h) `update_budget`:

```python
def update_budget(
    budget_id: int,
    name: str | None = None,
    category_ids: list[int] | None = None,
    amount: float | None = None,
    period: str | None = None,
) -> dict[str, Any] | None:
    sets: list[str] = []
    params: list[Any] = []
    with get_connection() as conn:
        if name is not None:
            sets.append("name = ?")
            params.append(_validate_name(name))
        if amount is not None:
            _validate_amount(amount)
            sets.append("amount = ?")
            params.append(amount)
        if period is not None:
            sets.append("period = ?")
            params.append(_validate_period(period))
        if category_ids is not None:
            current = conn.execute("SELECT period FROM budgets WHERE id = ?", (budget_id,)).fetchone()
            period_for_check = period if period is not None else (current["period"] if current else "monthly")
            sets.append("category_ids = ?")
            params.append(json.dumps(_validate_categories(conn, category_ids, budget_id, period_for_check)))
        if not sets:
            return _get_budget(budget_id)
        params.extend([_now(), budget_id])
        cursor = conn.execute(
            f"UPDATE budgets SET {', '.join(sets)}, updated_at = ? WHERE id = ?",
            params,
        )
        if cursor.rowcount <= 0:
            return None
    result = _get_budget(budget_id)
    if result:
        log_crud_event("budgets", budget_id, "UPDATE", result)
    return result
```

- [ ] **Step 4: Models + API anpassen**

`backend/finance_server/models/budget.py`:

```python
class BudgetCreateRequest(BaseModel):
    name: str
    category_ids: list[int]
    amount: float
    period: str = "monthly"


class BudgetUpdateRequest(BaseModel):
    name: str | None = None
    category_ids: list[int] | None = None
    amount: float | None = None
    period: str | None = None
```

`backend/finance_server/api/budgets.py`:

```python
@router.post("/db/budgets")
def create_budget_endpoint(request: BudgetCreateRequest) -> dict[str, Any]:
    try:
        return create_budget(request.name, request.category_ids, request.amount, request.period)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/db/budgets/{budget_id}")
def update_budget_endpoint(budget_id: int, request: BudgetUpdateRequest) -> dict[str, Any]:
    result = update_budget(
        budget_id,
        name=request.name,
        category_ids=request.category_ids,
        amount=request.amount,
        period=request.period,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Budget nicht gefunden")
    return result
```

- [ ] **Step 5: Tests laufen lassen**

Run: `cd backend && .venv/bin/pytest tests/test_budgets.py -v`
Expected: PASS (alle Klassen, inkl. neuer `TestYearlyBudgets`).

- [ ] **Step 6: Gesamte Backend-Testsuite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/finance_server/db/budgets.py backend/finance_server/models/budget.py backend/finance_server/api/budgets.py backend/tests/test_budgets.py
git commit -m "feat(budgets): support yearly period with YTD spent"
```

---

### Task 3: Frontend — Budget-Typ, API-Calls, Utils

**Files:**
- Modify: `frontend/src/lib/budgets.ts`
- Modify: `frontend/src/pages/budgets/utils.ts`

**Interfaces:**
- Consumes: Task 2 API (Felder `amount`, `period`).
- Produces:
  - `type BudgetPeriod = "monthly" | "yearly"`, `Budget` mit `amount`/`period`.
  - `createBudget(name, category_ids, amount, period = "monthly")`, `updateBudget(budgetId, name, category_ids, amount, period)`.
  - `categoryIdsForPeriod(budgets: Budget[], period: BudgetPeriod, excludeId?: number): Set<number>`.

- [ ] **Step 1: `lib/budgets.ts` umbauen**

```typescript
export type BudgetPeriod = "monthly" | "yearly";

export type Budget = {
  id: number;
  category_ids: number[];
  name: string;
  categories: { name: string; icon: string | null }[];
  amount: number;
  period: BudgetPeriod;
  spent: number;
  remaining: number;
  is_over: boolean;
};
```

`BudgetStub` und die beiden API-Funktionen:

```typescript
type BudgetStub = Pick<Budget, "id" | "name" | "category_ids" | "amount" | "period">;

export async function createBudget(
  name: string,
  category_ids: number[],
  amount: number,
  period: BudgetPeriod = "monthly",
): Promise<BudgetStub> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category_ids, amount, period }),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function updateBudget(
  budgetId: number,
  name: string,
  category_ids: number[],
  amount: number,
  period: BudgetPeriod,
): Promise<BudgetStub> {
  const response = await fetch(`${getApiBaseUrl()}/db/budgets/${budgetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category_ids, amount, period }),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}
```

- [ ] **Step 2: Helper in `pages/budgets/utils.ts` ergänzen**

```typescript
import type { Budget, BudgetPeriod } from "@/lib/budgets";

export function categoryIdsForPeriod(
  budgets: Budget[],
  period: BudgetPeriod,
  excludeId?: number,
): Set<number> {
  return new Set(
    budgets
      .filter((b) => b.period === period && b.id !== excludeId)
      .flatMap((b) => b.category_ids),
  );
}
```

- [ ] **Step 3: Typcheck + Build**

Run: `pnpm --dir frontend exec tsc --noEmit && pnpm --dir frontend build`
Expected: beide grün (Keine Fehler, da `monthly_amount`-Referenzen erst in Task 4 entfernt werden, wird tsc nur über ungenutzte `BudgetStub`-Änderung klagen → prüfen, dass mindestens keine Fehler in `lib/budgets.ts`/`utils.ts`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/budgets.ts frontend/src/pages/budgets/utils.ts
git commit -m "feat(budgets): add period to frontend budget types and API calls"
```

---

### Task 4: Frontend — Seite, Karte, Dialoge, Hook

**Files:**
- Modify: `frontend/src/pages/budgets/budgets-page.tsx`
- Modify: `frontend/src/pages/budgets/components/budget-card.tsx`
- Modify: `frontend/src/pages/budgets/components/add-budget-dialog.tsx`
- Modify: `frontend/src/pages/budgets/components/edit-budget-dialog.tsx`
- Modify: `frontend/src/pages/budgets/hooks/use-budgets.ts`
- Create: `frontend/src/pages/budgets/components/period-toggle.tsx`

**Interfaces:**
- Consumes: Task 3 (`Budget`, `BudgetPeriod`, `categoryIdsForPeriod`).
- Produces: Seite zeigt Monats- und Jahresbudgets im selben Raster; Dialoge mit Monat/Jahr-Umschalter; Karte mit „Jahr"-Badge.

- [ ] **Step 1: `period-toggle.tsx` anlegen**

```tsx
import type { BudgetPeriod } from "@/lib/budgets";
import { cn } from "@/lib/utils";

const OPTIONS: { value: BudgetPeriod; label: string }[] = [
  { value: "monthly", label: "Monat" },
  { value: "yearly", label: "Jahr" },
];

export function PeriodToggle({
  value,
  onChange,
}: {
  value: BudgetPeriod;
  onChange: (period: BudgetPeriod) => void;
}) {
  return (
    <div className="flex rounded-md bg-muted p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 cursor-pointer rounded px-3 py-1 text-xs font-medium transition-colors",
            value === opt.value ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `add-budget-dialog.tsx` — period state + Umschalter**

```tsx
export function AddBudgetDialog({
  open,
  onOpenChange,
  categories,
  existingCategoryIds,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: FinanceCategory[];
  existingCategoryIds: Record<BudgetPeriod, Set<number>>;
  onCreate: (name: string, categoryIds: number[], amount: number, period: BudgetPeriod) => void;
}) {
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const available = categories.filter((c) => !existingCategoryIds[period].has(c.id));
```

Zusätzlich: `<PeriodToggle value={period} onChange={setPeriod} />` zwischen Titel und Namens-Input einfügen; `onCreate(name.trim(), [...selected], Number(amount), period)`; `placeholder="Monatsbudget"` → `placeholder={period === "monthly" ? "Monatsbudget" : "Jahresbudget"}`; `import { useState }` + Import von `PeriodToggle` und `BudgetPeriod` ergänzen. Beim erfolgreichen Submit `setPeriod("monthly")` zurücksetzen.

- [ ] **Step 3: `edit-budget-dialog.tsx` — period state + Umschalter**

```tsx
export function EditBudgetDialog({
  open,
  budget,
  categories,
  existingCategoryIds,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  budget: Budget | null;
  categories: FinanceCategory[];
  existingCategoryIds: Record<BudgetPeriod, Set<number>>;
  onOpenChange: (open: boolean) => void;
  onSave: (
    id: number,
    name: string,
    categoryIds: number[],
    amount: number,
    period: BudgetPeriod,
  ) => Promise<void>;
}) {
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
```

Im `useEffect` (`if (open && budget)`): zusätzlich `setPeriod(budget.period)`. `setAmount(String(budget.monthly_amount))` → `setAmount(String(budget.amount))`. `available` nutzt `existingCategoryIds[period]`. Im `save()`: `onSave(budget.id, name.trim(), [...selected], parsed, period)`. `<PeriodToggle value={period} onChange={setPeriod} />` nach dem Titel einfügen. Import `PeriodToggle`, `BudgetPeriod` ergänzen.

- [ ] **Step 4: `budget-card.tsx` — amount + Jahr-Badge**

- `budget.monthly_amount` → `budget.amount` (Zeile 22 und 103).
- Über der Status-Pille (im rechten `div`, Zeile 38-47) bei `budget.period === "yearly"` eine Badge ergänzen:

```tsx
{budget.period === "yearly" && (
  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
    Jahr
  </span>
)}
```

- `formatAmount(budget.monthly_amount)` → `formatAmount(budget.amount)`.
- Fortschritts-Label Zeile 109: `% vom Budget genutzt` → `% vom {budget.period === "yearly" ? "Jahresbudget" : "Budget"} genutzt`.

- [ ] **Step 5: `use-budgets.ts` — period durchreichen**

```typescript
const create = useCallback(
  async (name: string, categoryIds: number[], amount: number, period: BudgetPeriod) => {
    await createBudgetApi(name, categoryIds, amount, period);
    await load();
  },
  [load],
);

const update = useCallback(
  async (
    id: number,
    name: string,
    categoryIds: number[],
    amount: number,
    period: BudgetPeriod,
  ) => {
    await updateBudgetApi(id, name, categoryIds, amount, period);
    await load();
  },
  [load],
);
```

`import type { Budget, BudgetPeriod } from "@/lib/budgets";` anpassen.

- [ ] **Step 6: `budgets-page.tsx` — amounts, per-period Sets, Handler**

- Totals (Zeile 24-26): `b.monthly_amount` → `b.amount`.
- Oben (nach `totals`) das per-period Mapping:

```tsx
const existingByPeriod: Record<BudgetPeriod, Set<number>> = {
  monthly: categoryIdsForPeriod(budgets, "monthly"),
  yearly: categoryIdsForPeriod(budgets, "yearly"),
};

const existingForEdit: Record<BudgetPeriod, Set<number>> = {
  monthly: categoryIdsForPeriod(budgets, "monthly", editingBudget?.id),
  yearly: categoryIdsForPeriod(budgets, "yearly", editingBudget?.id),
};
```

- `handleCreate` und `handleSaveEdit`: Parameter `period: BudgetPeriod` ergänzen und an `create`/`update` durchreichen.
- Dialog-Props: `existingCategoryIds={existingByPeriod}` (Add) und `existingCategoryIds={existingForEdit}` (Edit); die `.filter((b) => b.id !== editingBudget?.id)`-Berechnung entfernen.
- Leerer Zustand (Zeile 126): Text → „Lege ein Budget für eine Kategorie an, um deine monatlichen oder jährlichen Ausgaben im Blick zu behalten."
- Imports: `BudgetPeriod` und `categoryIdsForPeriod` ergänzen.

- [ ] **Step 7: Build + Lint**

Run: `pnpm --dir frontend exec tsc --noEmit && pnpm --dir frontend build`
Expected: grün (keine `monthly_amount`-Referenzen mehr in `frontend/src`).

Run: `pnpm --dir frontend exec eslint src/pages/budgets --max-warnings 0`
Expected: keine Fehler/Warnungen.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/budgets
git commit -m "feat(budgets): add yearly period to budgets page, cards and dialogs"
```

---

## Self-Review Notizen

- Spec-Coverage: Schema+Sync (Task 1) ✓, Spent YTD (Task 2) ✓, API amount/period (Task 2) ✓, Kategorie pro Period exklusiv (Task 2) ✓, Frontend Raster+Badge+Dialogs (Task 4) ✓, leerer Zustand (Task 4) ✓. YAGNI-Punkte (Jahres-Picker, Rollover, Drilldown) sind bewusst nicht enthalten.
- Typ-Konsistenz: `amount`/`period` durchgängig in Backend-Response, `Budget`, Dialogen; `categoryIdsForPeriod`-Signature in Task 3 definiert, Task 4 nutzt sie identisch.
- Keine Platzhalter, alle Code-Steps komplett.
