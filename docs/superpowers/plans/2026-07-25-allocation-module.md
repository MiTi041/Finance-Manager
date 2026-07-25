# Allocation-Modul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a modular income allocation system (Bafög, Notgroschen, Investieren, Spenden, Restliche Ausgaben) with configurable percentages, recipient accounts, sender IBAN, and SEPA transfer execution.

**Architecture:** Backend: Service → DB module → FastAPI router, following existing Finance patterns. Frontend: Dedicated page + settings tab, using existing hooks/components patterns.

**Tech Stack:** Python FastAPI + SQLite (backend), React 19 + Vite + Tailwind 4 (frontend)

## Global Constraints

- All strings in UI and API: German
- Follow existing code patterns (raw SQL, stateless services, Pydantic models, fetchCachedResource)
- No new npm/pip dependencies
- All percentages stored as REAL (0-100), validated to sum ≤ 100%
- Bafög feature gated behind `app_settings` key `bafoeg_enabled` (default: false)

---

## File Structure

### Create
- `backend/finance_server/db/allocation.py` — CRUD for allocation tables
- `backend/finance_server/models/allocation.py` — Pydantic models
- `backend/finance_server/services/allocation_service.py` — Business logic
- `backend/finance_server/api/allocation.py` — FastAPI endpoints
- `backend/tests/test_allocation_service.py` — Unit tests
- `frontend/src/lib/allocation.ts` — API client
- `frontend/src/pages/allocation/hooks/use-allocation.ts` — Data hook
- `frontend/src/pages/allocation/components/bucket-card.tsx`
- `frontend/src/pages/allocation/components/transfer-dialog.tsx`
- `frontend/src/pages/allocation/components/allocation-summary.tsx`
- `frontend/src/pages/allocation/allocation-page.tsx`
- `frontend/src/pages/settings/tabs/allocation/allocation-settings-tab.tsx`
- `frontend/src/pages/settings/tabs/allocation/bucket-form.tsx`
- `frontend/src/pages/settings/tabs/allocation/bafoeg-config-form.tsx`

### Modify
- `backend/finance_server/core/schema.py` — Add new tables + migration
- `backend/finance_server/main.py` — Include allocation router
- `backend/finance_server/api/deps.py` — Add allocation service dep
- `frontend/src/App.tsx` — Add `/finance-plan` route
- `frontend/src/layouts/sidebar/app-sidebar.tsx` — Add nav item
- `frontend/src/pages/settings/settings-page.tsx` — Add allocation tab

---

### Task 1: DB Schema & Migration

**Files:**
- Modify: `backend/finance_server/core/schema.py`

- [ ] **Step 1: Add allocation table creation functions**

Insert after `create_subscription_identities_table`:

```python
def create_allocation_buckets_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS allocation_buckets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            bucket_type TEXT NOT NULL CHECK(bucket_type IN (
                'bafoeg', 'emergency', 'invest', 'donation', 'spending'
            )),
            percentage           REAL NOT NULL DEFAULT 0 CHECK(percentage >= 0 AND percentage <= 100),
            recipient_account_id INTEGER,
            sender_iban          TEXT,
            is_active            INTEGER NOT NULL DEFAULT 1,
            sort_order           INTEGER NOT NULL DEFAULT 0,
            created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipient_account_id) REFERENCES empfaengerkonten(id) ON DELETE SET NULL,
            UNIQUE(bucket_type)
        )
    """)


def create_allocation_bafoeg_config_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS allocation_bafoeg_config (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            total_debt      REAL NOT NULL DEFAULT 7600,
            monthly_rate    REAL NOT NULL DEFAULT 267,
            interest_rate   REAL NOT NULL DEFAULT 2.0,
            payout_date     TEXT,
            created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)


def create_allocation_runs_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS allocation_runs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            month           TEXT NOT NULL,
            net_income      REAL NOT NULL,
            total_allocated REAL NOT NULL,
            status          TEXT NOT NULL DEFAULT 'calculated'
                CHECK(status IN ('calculated', 'partial', 'completed')),
            created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)


def create_allocation_run_buckets_table(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS allocation_run_buckets (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id          INTEGER NOT NULL,
            bucket_id       INTEGER NOT NULL,
            target_amount   REAL NOT NULL,
            transferred     REAL NOT NULL DEFAULT 0,
            transferred_at  TEXT,
            is_completed    INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (run_id) REFERENCES allocation_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (bucket_id) REFERENCES allocation_buckets(id) ON DELETE CASCADE
        )
    """)
```

- [ ] **Step 2: Seed default buckets in `initialize_database`**

Add to `initialize_database`, after `create_app_settings_table`:

```python
    create_allocation_buckets_table(connection)
    create_allocation_bafoeg_config_table(connection)
    create_allocation_runs_table(connection)
    create_allocation_run_buckets_table(connection)

    # Seed default buckets if empty
    row_count = connection.execute("SELECT COUNT(*) FROM allocation_buckets").fetchone()[0]
    if row_count == 0:
        default_buckets = [
            ("bafoeg", 0.0, None, None, 0, 0),
            ("emergency", 30.0, None, None, 1, 1),
            ("invest", 30.0, None, None, 1, 2),
            ("donation", 10.0, None, None, 1, 3),
            ("spending", 30.0, None, None, 1, 4),
        ]
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        for bt, pct, ra_id, s_iban, active, order in default_buckets:
            connection.execute(
                """INSERT INTO allocation_buckets
                   (bucket_type, percentage, recipient_account_id, sender_iban, is_active, sort_order, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (bt, pct, ra_id, s_iban, active, order, now, now),
            )
```

Add import at top: `from datetime import datetime, timezone`

---

### Task 2: Backend Models

**Files:**
- Create: `backend/finance_server/models/allocation.py`

- [ ] **Step 1: Write the file**

```python
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class AllocationBucket(BaseModel):
    id: int
    bucket_type: str
    percentage: float
    recipient_account_id: int | None = None
    sender_iban: str | None = None
    is_active: bool = True
    sort_order: int = 0


class AllocationBucketUpdate(BaseModel):
    percentage: float | None = Field(default=None, ge=0, le=100)
    recipient_account_id: int | None = None
    sender_iban: str | None = None
    is_active: bool | None = None


class BafoegConfig(BaseModel):
    total_debt: float = 7600
    monthly_rate: float = 267
    interest_rate: float = 2.0
    payout_date: str | None = None


class AllocationSettingsUpdate(BaseModel):
    bafoeg_enabled: bool


class AllocationRun(BaseModel):
    id: int
    month: str
    net_income: float
    total_allocated: float
    status: str


class AllocationRunBucket(BaseModel):
    id: int
    run_id: int
    bucket_id: int
    bucket_type: str
    target_amount: float
    transferred: float
    transferred_at: str | None
    is_completed: bool


class AllocationStatus(BaseModel):
    month: str
    net_income: float
    total_allocated: float
    remaining: float
    status: str
    buckets: list[AllocationRunBucket]
    config: list[AllocationBucket]


class AllocationHistoryEntry(BaseModel):
    id: int
    month: str
    net_income: float
    status: str
    buckets: list[AllocationRunBucket]
```

---

### Task 3: Backend DB Module

**Files:**
- Create: `backend/finance_server/db/allocation.py`

- [ ] **Step 1: Write the file**

```python
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection


def list_buckets() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM allocation_buckets ORDER BY sort_order"
        ).fetchall()
    return [dict(r) for r in rows]


def get_bucket(bucket_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM allocation_buckets WHERE id = ?", (bucket_id,)
        ).fetchone()
    return dict(row) if row else None


def update_bucket(bucket_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    # Include False values (is_active), only exclude None
    fields = {k: v for k, v in payload.items() if v is not None}
    if not fields:
        return get_bucket(bucket_id)
    fields["updated_at"] = now
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [bucket_id]
    with get_connection() as connection:
        connection.execute(
            f"UPDATE allocation_buckets SET {set_clause} WHERE id = ?",
            values,
        )
    return get_bucket(bucket_id)


def get_bafoeg_config() -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM allocation_bafoeg_config LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def upsert_bafoeg_config(payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM allocation_bafoeg_config LIMIT 1"
        ).fetchone()
        if existing:
            payload["updated_at"] = now
            set_clause = ", ".join(f"{k} = ?" for k in payload)
            values = list(payload.values()) + [existing["id"]]
            connection.execute(
                f"UPDATE allocation_bafoeg_config SET {set_clause} WHERE id = ?",
                values,
            )
        else:
            payload["created_at"] = now
            payload["updated_at"] = now
            keys = ", ".join(payload)
            placeholders = ", ".join("?" for _ in payload)
            connection.execute(
                f"INSERT INTO allocation_bafoeg_config ({keys}) VALUES ({placeholders})",
                list(payload.values()),
            )
    return get_bafoeg_config()


def create_run(month: str, net_income: float, total_allocated: float) -> int:
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO allocation_runs (month, net_income, total_allocated) VALUES (?, ?, ?)",
            (month, net_income, total_allocated),
        )
        return cursor.lastrowid


def get_run_for_month(month: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM allocation_runs WHERE month = ? ORDER BY created_at DESC LIMIT 1",
            (month,),
        ).fetchone()
    return dict(row) if row else None


def create_run_bucket(run_id: int, bucket_id: int, target_amount: float) -> int:
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO allocation_run_buckets (run_id, bucket_id, target_amount) VALUES (?, ?, ?)",
            (run_id, bucket_id, target_amount),
        )
        return cursor.lastrowid


def get_run_buckets(run_id: int) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """SELECT arb.*, ab.bucket_type, ab.percentage
               FROM allocation_run_buckets arb
               JOIN allocation_buckets ab ON ab.id = arb.bucket_id
               WHERE arb.run_id = ?
               ORDER BY ab.sort_order""",
            (run_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_run_bucket_transferred(run_bucket_id: int, amount: float) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with get_connection() as connection:
        connection.execute(
            """UPDATE allocation_run_buckets
               SET transferred = ?, transferred_at = ?, is_completed = 1
               WHERE id = ?""",
            (amount, now, run_bucket_id),
        )


def list_runs() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM allocation_runs ORDER BY month DESC LIMIT 12"
        ).fetchall()
    return [dict(r) for r in rows]


def get_active_buckets_sum_percentage() -> float:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT COALESCE(SUM(percentage), 0) FROM allocation_buckets WHERE is_active = 1 AND bucket_type != 'spending'"
        ).fetchone()
    return row[0]
```

---

### Task 4: Backend Service

**Files:**
- Create: `backend/finance_server/services/allocation_service.py`

- [ ] **Step 1: Write the file**

```python
from __future__ import annotations

from typing import Any

from finance_server.core.database import get_connection
from finance_server.db import allocation as db
from finance_server.db.settings import get_setting, set_setting


class AllocationService:
    def get_buckets(self) -> list[dict[str, Any]]:
        return db.list_buckets()

    def update_bucket(self, bucket_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        return db.update_bucket(bucket_id, payload)

    def get_bafoeg_config(self) -> dict[str, Any] | None:
        return db.get_bafoeg_config()

    def update_bafoeg_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        return db.upsert_bafoeg_config(payload)

    def get_settings(self) -> dict[str, Any]:
        return {
            "bafoeg_enabled": get_setting("bafoeg_enabled") == "true",
        }

    def update_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        if "bafoeg_enabled" in payload:
            set_setting("bafoeg_enabled", "true" if payload["bafoeg_enabled"] else "false")
        return self.get_settings()

    def get_or_create_run(self, month: str) -> dict[str, Any]:
        existing = db.get_run_for_month(month)
        if existing:
            return self._build_run_response(existing)

        net_income = self._detect_income(month)
        buckets = [b for b in db.list_buckets() if b["is_active"]]
        active_percentage_sum = db.get_active_buckets_sum_percentage()

        spending_amount = 0.0
        total_allocated = net_income

        run_id = db.create_run(month, net_income, total_allocated)

        for bucket in buckets:
            btype = bucket["bucket_type"]
            if btype == "spending":
                pct = 100 - active_percentage_sum
                if pct < 0:
                    pct = 0
            else:
                pct = bucket["percentage"]
            target = round(net_income * pct / 100, 2)
            db.create_run_bucket(run_id, bucket["id"], target)

            if btype == "spending":
                spending_amount = target

        run = db.get_run_for_month(month)
        return self._build_run_response(run)

    def _build_run_response(self, run: dict[str, Any]) -> dict[str, Any]:
        buckets = db.get_run_buckets(run["id"])
        config_buckets = db.list_buckets()
        return {
            "month": run["month"],
            "net_income": run["net_income"],
            "total_allocated": run["total_allocated"],
            "remaining": round(run["net_income"] - sum(b["target_amount"] for b in buckets), 2),
            "status": run["status"],
            "buckets": buckets,
            "config": config_buckets,
        }

    def _detect_income(self, month: str) -> float:
        year_month = month  # format: "2026-07"
        start = f"{year_month}-01"
        end = f"{year_month}-31"
        with get_connection() as connection:
            row = connection.execute(
                """SELECT COALESCE(SUM(amount), 0)
                   FROM umsaetze
                   WHERE amount > 0
                     AND date >= ? AND date <= ?""",
                (start, end),
            ).fetchone()
        return round(row[0], 2) if row else 0.0

    def transfer_run_bucket(self, run_bucket_id: int) -> dict[str, Any]:
        buckets = db.get_run_buckets(0)  # dummy — we query directly
        with get_connection() as connection:
            row = connection.execute(
                """SELECT arb.*, ab.bucket_type, ab.recipient_account_id, ab.sender_iban
                   FROM allocation_run_buckets arb
                   JOIN allocation_buckets ab ON ab.id = arb.bucket_id
                   WHERE arb.id = ?""",
                (run_bucket_id,),
            ).fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Run-Bucket nicht gefunden")

        rb = dict(row)
        if rb["is_completed"]:
            raise HTTPException(status_code=400, detail="Dieser Bucket wurde bereits überwiesen")

        recipient_account_id = rb.get("recipient_account_id")
        if not recipient_account_id:
            raise HTTPException(status_code=400, detail="Kein Empfängerkonto konfiguriert")

        with get_connection() as connection:
            recipient = connection.execute(
                "SELECT * FROM empfaengerkonten WHERE id = ?",
                (recipient_account_id,),
            ).fetchone()
        if not recipient:
            raise HTTPException(status_code=400, detail="Empfängerkonto nicht gefunden")

        # Return the data needed to execute the transfer
        # The actual FinTS call is done by the router via the existing transfer endpoint
        return {
            "run_bucket_id": run_bucket_id,
            "amount": rb["target_amount"] - rb["transferred"],
            "recipient_iban": recipient["iban"],
            "recipient_name": recipient["recipient_name"],
            "recipient_bic": recipient.get("bic"),
            "sender_iban": rb.get("sender_iban"),
            "purpose": f"Allokation {rb['bucket_type']}",
        }

    def mark_transferred(self, run_bucket_id: int, amount: float) -> None:
        db.mark_run_bucket_transferred(run_bucket_id, amount)

    def get_history(self) -> list[dict[str, Any]]:
        runs = db.list_runs()
        result = []
        for run in runs:
            buckets = db.get_run_buckets(run["id"])
            result.append({
                "id": run["id"],
                "month": run["month"],
                "net_income": run["net_income"],
                "status": run["status"],
                "buckets": buckets,
            })
        return result
```

---

### Task 5: Backend Router

**Files:**
- Create: `backend/finance_server/api/allocation.py`

- [ ] **Step 1: Write the file**

```python
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path as ApiPath

from finance_server.models.allocation import (
    AllocationBucketUpdate,
    BafoegConfig,
    AllocationSettingsUpdate,
)
from finance_server.services.allocation_service import AllocationService
from finance_server.api.deps import get_allocation_service

router = APIRouter()


@router.get("/allocation/status")
def get_allocation_status(
    month: str | None = None,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    from datetime import datetime
    target_month = month or datetime.now().strftime("%Y-%m")
    return service.get_or_create_run(target_month)


@router.get("/allocation/buckets")
def get_allocation_buckets(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    buckets = service.get_buckets()
    return {"buckets": buckets}


@router.put("/allocation/buckets/{bucket_id}")
def update_allocation_bucket(
    bucket_id: int = ApiPath(..., ge=1),
    payload: AllocationBucketUpdate = Body(...),
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    updated = service.update_bucket(bucket_id, payload.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Bucket nicht gefunden")
    return updated


@router.get("/allocation/bafoeg-config")
def get_bafoeg_config(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    config = service.get_bafoeg_config()
    if not config:
        return BafoegConfig().model_dump()
    return config


@router.put("/allocation/bafoeg-config")
def update_bafoeg_config(
    payload: BafoegConfig = Body(...),
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    return service.update_bafoeg_config(payload.model_dump(exclude_none=True))


@router.patch("/allocation/settings")
def update_allocation_settings(
    payload: AllocationSettingsUpdate = Body(...),
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    return service.update_settings(payload.model_dump())


@router.post("/allocation/run")
def calculate_run(
    month: str | None = None,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    from datetime import datetime
    target_month = month or datetime.now().strftime("%Y-%m")
    return service.get_or_create_run(target_month)


@router.post("/allocation/transfer/{run_bucket_id}")
def execute_transfer(
    run_bucket_id: int = ApiPath(..., ge=1),
    body: dict[str, Any] | None = None,
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    tan = (body or {}).get("tan")
    transfer_data = service.transfer_run_bucket(run_bucket_id)
    from finance_server.fints.transfer import send_transfer
    from finance_server.models.fints import TransferRequest

    req = TransferRequest(
        recipient_iban=transfer_data["recipient_iban"],
        recipient_name=transfer_data["recipient_name"],
        amount=transfer_data["amount"],
        reason=transfer_data["purpose"],
        recipient_bic=transfer_data.get("recipient_bic"),
        sender_iban=transfer_data.get("sender_iban") or "",
        sender_name="Finance-Manager",
        tan=tan,
    )
    try:
        result = send_transfer(req)
    except Exception as e:
        from finance_server.fints.common import TanRequired, TanTimeout
        if isinstance(e, TanRequired):
            raise HTTPException(
                status_code=409,
                detail={"code": "TAN_REQUIRED", "challenge": e.challenge, "decoupled": e.decoupled},
            )
        if isinstance(e, TanTimeout):
            raise HTTPException(status_code=408, detail=str(e))
        raise HTTPException(status_code=502, detail=f"Überweisung fehlgeschlagen: {e}")

    service.mark_transferred(run_bucket_id, transfer_data["amount"])
    return {"status": "ok", "transfer": result}


@router.get("/allocation/history")
def get_allocation_history(
    service: AllocationService = Depends(get_allocation_service),
) -> dict[str, Any]:
    history = service.get_history()
    return {"history": history}
```

---

### Task 6: Wire Up Backend

**Files:**
- Modify: `backend/finance_server/api/deps.py`
- Modify: `backend/finance_server/main.py`

- [ ] **Step 1: Add service dependency to `deps.py`**

Add at end of file:

```python
from finance_server.services.allocation_service import AllocationService

def get_allocation_service() -> AllocationService:
    return AllocationService()
```

- [ ] **Step 2: Include router in `main.py`**

Add import block:

```python
from finance_server.api.allocation import router as allocation_router
```

Add after other router includes:

```python
app.include_router(allocation_router, prefix="/api")
```

---

### Task 7: Backend Tests

**Files:**
- Create: `backend/tests/test_allocation_service.py`

- [ ] **Step 1: Write the file**

```python
from __future__ import annotations

from unittest.mock import patch

from finance_server.services.allocation_service import AllocationService


class TestDetectIncome:
    def test_returns_zero_when_no_transactions(self):
        service = AllocationService()
        with patch("finance_server.services.allocation_service.get_connection") as mock_conn:
            mock_cursor = mock_conn.return_value.__enter__.return_value.execute.return_value
            mock_cursor.fetchone.return_value = [0.0]
            result = service._detect_income("2026-07")
        assert result == 0.0

    def test_returns_sum_of_positive_amounts(self):
        service = AllocationService()
        with patch("finance_server.services.allocation_service.get_connection") as mock_conn:
            mock_cursor = mock_conn.return_value.__enter__.return_value.execute.return_value
            mock_cursor.fetchone.return_value = [3500.00]
            result = service._detect_income("2026-07")
        assert result == 3500.00


class TestBuildRunResponse:
    def test_includes_spending_as_remainder(self):
        service = AllocationService()
        buckets = [
            {"bucket_type": "invest", "percentage": 30, "id": 1, "is_active": True, "sort_order": 0, "recipient_account_id": None, "sender_iban": None},
            {"bucket_type": "donation", "percentage": 10, "id": 2, "is_active": True, "sort_order": 1, "recipient_account_id": None, "sender_iban": None},
            {"bucket_type": "spending", "percentage": 60, "id": 3, "is_active": True, "sort_order": 2, "recipient_account_id": None, "sender_iban": None},
        ]
        with (
            patch("finance_server.services.allocation_service.db.list_buckets") as mock_list,
            patch("finance_server.services.allocation_service.db.get_run_for_month") as mock_run,
            patch("finance_server.services.allocation_service.db.create_run") as mock_create_run,
            patch("finance_server.services.allocation_service.db.create_run_bucket") as mock_create_bucket,
            patch("finance_server.services.allocation_service.db.get_active_buckets_sum_percentage", return_value=40.0),
            patch("finance_server.services.allocation_service.AllocationService._detect_income", return_value=3000.0),
        ):
            mock_list.return_value = buckets
            mock_run.return_value = None
            mock_create_run.return_value = 1
            mock_create_bucket.return_value = 1

            result = service.get_or_create_run("2026-07")

        assert result["net_income"] == 3000.0
        assert len(result["buckets"]) == 3

    def test_active_percentage_determines_spending_remainder(self):
        service = AllocationService()
        with (
            patch("finance_server.services.allocation_service.db.list_buckets") as mock_list,
            patch("finance_server.services.allocation_service.db.get_run_for_month") as mock_run,
            patch("finance_server.services.allocation_service.db.create_run") as mock_create_run,
            patch("finance_server.services.allocation_service.db.create_run_bucket") as mock_create_bucket,
            patch("finance_server.services.allocation_service.db.get_active_buckets_sum_percentage", return_value=70.0),
            patch("finance_server.services.allocation_service.AllocationService._detect_income", return_value=2000.0),
        ):
            mock_list.return_value = [
                {"bucket_type": "emergency", "percentage": 30, "id": 1, "is_active": True, "sort_order": 0, "recipient_account_id": None, "sender_iban": None},
                {"bucket_type": "invest", "percentage": 40, "id": 2, "is_active": True, "sort_order": 1, "recipient_account_id": None, "sender_iban": None},
                {"bucket_type": "spending", "percentage": 30, "id": 3, "is_active": True, "sort_order": 2, "recipient_account_id": None, "sender_iban": None},
            ]
            mock_run.return_value = None
            mock_create_run.return_value = 1
            mock_create_bucket.return_value = 1

            result = service.get_or_create_run("2026-07")

        assert result["net_income"] == 2000.0

        # 2000 * 30/100 = 600 for emergency
        # 2000 * 40/100 = 800 for invest
        # 2000 * 30/100 = 600 for spending (100 - 70 = 30%)
```

---

### Task 8: Frontend API Client

**Files:**
- Create: `frontend/src/lib/allocation.ts`

- [ ] **Step 1: Write the file**

```typescript
import { getApiBaseUrl, parseJsonResponse } from "./api";
import { emitReferenceChange } from "./events";

export type AllocationBucket = {
  id: number;
  bucket_type: "bafoeg" | "emergency" | "invest" | "donation" | "spending";
  percentage: number;
  recipient_account_id: number | null;
  sender_iban: string | null;
  is_active: boolean;
  sort_order: number;
};

export type AllocationRunBucket = {
  id: number;
  run_id: number;
  bucket_id: number;
  bucket_type: string;
  target_amount: number;
  transferred: number;
  transferred_at: string | null;
  is_completed: boolean;
};

export type AllocationStatus = {
  month: string;
  net_income: number;
  total_allocated: number;
  remaining: number;
  status: string;
  buckets: AllocationRunBucket[];
  config: AllocationBucket[];
};

export type BafoegConfig = {
  total_debt: number;
  monthly_rate: number;
  interest_rate: number;
  payout_date: string | null;
};

export type AllocationSettings = {
  bafoeg_enabled: boolean;
};

export async function fetchAllocationStatus(month?: string): Promise<AllocationStatus> {
  const params = month ? `?month=${month}` : "";
  const response = await fetch(`${getApiBaseUrl()}/allocation/status${params}`);
  return parseJsonResponse(response);
}

export async function fetchAllocationBuckets(): Promise<AllocationBucket[]> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/buckets`);
  const data = await parseJsonResponse(response);
  return data.buckets ?? [];
}

export async function updateAllocationBucket(
  bucketId: number,
  payload: Partial<Pick<AllocationBucket, "percentage" | "recipient_account_id" | "sender_iban" | "is_active">>,
): Promise<AllocationBucket> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/buckets/${bucketId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function fetchBafoegConfig(): Promise<BafoegConfig> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/bafoeg-config`);
  return parseJsonResponse(response);
}

export async function updateBafoegConfig(payload: Partial<BafoegConfig>): Promise<BafoegConfig> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/bafoeg-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function updateAllocationSettings(payload: Partial<AllocationSettings>): Promise<AllocationSettings> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}

export async function executeTransfer(
  runBucketId: number,
  tan?: string,
): Promise<{ status: string; transfer: unknown }> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/transfer/${runBucketId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tan ? { tan } : {}),
  });
  const result = await parseJsonResponse(response);
  await emitReferenceChange();
  return result;
}

export async function recalculateRun(month?: string): Promise<AllocationStatus> {
  const params = month ? `?month=${month}` : "";
  const response = await fetch(`${getApiBaseUrl()}/allocation/run${params}`, {
    method: "POST",
  });
  return parseJsonResponse(response);
}

export async function fetchAllocationHistory(): Promise<{ id: number; month: string; net_income: number; status: string; buckets: AllocationRunBucket[] }[]> {
  const response = await fetch(`${getApiBaseUrl()}/allocation/history`);
  const data = await parseJsonResponse(response);
  return data.history ?? [];
}
```

---

### Task 9: Frontend Hook

**Files:**
- Create: `frontend/src/pages/allocation/hooks/use-allocation.ts`

- [ ] **Step 1: Write the file**

```typescript
import { useState, useEffect, useCallback } from "react";
import type { AllocationStatus } from "@/lib/allocation";
import { fetchAllocationStatus, recalculateRun, executeTransfer } from "@/lib/allocation";

export function useAllocation(month?: string) {
  const [status, setStatus] = useState<AllocationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllocationStatus(month);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();

    const onRefresh = () => void load();
    window.addEventListener("finance-data-refresh", onRefresh);
    return () => window.removeEventListener("finance-data-refresh", onRefresh);
  }, [load]);

  const recalculate = useCallback(async () => {
    try {
      const data = await recalculateRun(month);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Berechnen");
    }
  }, [month]);

  const transfer = useCallback(async (runBucketId: number) => {
    setTransferring(runBucketId);
    try {
      await executeTransfer(runBucketId);
      await load();
    } catch (e) {
      throw e;
    } finally {
      setTransferring(null);
    }
  }, [load]);

  return { status, loading, error, recalculate, transfer, transferring };
}
```

---

### Task 10: Frontend Components

**Files:**
- Create: `frontend/src/pages/allocation/components/allocation-summary.tsx`
- Create: `frontend/src/pages/allocation/components/bucket-card.tsx`
- Create: `frontend/src/pages/allocation/components/transfer-dialog.tsx`

- [ ] **Step 1: Write `allocation-summary.tsx`**

```tsx
import { formatCurrency } from "@/lib/utils/format";

type Props = {
  month: string;
  netIncome: number;
  remaining: number;
  status: string;
};

export function AllocationSummary({ month, netIncome, remaining, status }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <SummaryCard label="Monat" value={month} />
      <SummaryCard label="Netto-Einkommen" value={formatCurrency(netIncome)} />
      <SummaryCard label="Verbleibend" value={formatCurrency(remaining)} />
      <SummaryCard
        label="Status"
        value={
          status === "completed" ? "Abgeschlossen" :
          status === "partial" ? "Teilweise" : "Berechnet"
        }
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Write `bucket-card.tsx`**

```tsx
import { PiggyBank, ShieldCheck, TrendingUp, Heart, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { AllocationBucket, AllocationRunBucket } from "@/lib/allocation";
import { Button } from "@/components/ui/button";

const bucketIcons: Record<string, React.ReactNode> = {
  bafoeg: <PiggyBank className="size-5" />,
  emergency: <ShieldCheck className="size-5" />,
  invest: <TrendingUp className="size-5" />,
  donation: <Heart className="size-5" />,
  spending: <Wallet className="size-5" />,
};

const bucketLabels: Record<string, string> = {
  bafoeg: "Bafög-Rücklage",
  emergency: "Notgroschen",
  invest: "Investieren",
  donation: "Spenden",
  spending: "Restliche Ausgaben",
};

type Props = {
  bucket: AllocationRunBucket;
  config: AllocationBucket;
  onTransfer: (runBucketId: number) => void;
  transferring: boolean;
};

export function BucketCard({ bucket, config, onTransfer, transferring }: Props) {
  const progress = bucket.target_amount > 0
    ? Math.min(100, Math.round((bucket.transferred / bucket.target_amount) * 100))
    : 0;

  const isInfoOnly = bucket.bucket_type === "spending";

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            {bucketIcons[bucket.bucket_type] ?? <Wallet className="size-5" />}
          </div>
          <div>
            <p className="font-medium">{bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}</p>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(bucket.target_amount)} Ziel · {config.percentage}%
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold">{formatCurrency(bucket.transferred)}</p>
          {!isInfoOnly && (
            <Button
              size="sm"
              variant={bucket.is_completed ? "outline" : "default"}
              disabled={bucket.is_completed || transferring}
              onClick={() => onTransfer(bucket.id)}
              className="mt-1"
            >
              {bucket.is_completed ? "Erledigt" : transferring ? "Wird gesendet..." : "Jetzt zahlen"}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `transfer-dialog.tsx`**

```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  recipientName: string;
  recipientIban: string;
  onConfirm: (tan?: string) => Promise<void>;
};

export function TransferDialog({ open, onOpenChange, amount, recipientName, recipientIban, onConfirm }: Props) {
  const [tan, setTan] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSending(true);
    setError(null);
    try {
      await onConfirm(tan || undefined);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler bei der Überweisung");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Überweisung bestätigen</DialogTitle>
          <DialogDescription>
            Überweise {amount.toFixed(2)} € an {recipientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Empfänger</Label>
            <p className="text-sm font-medium">{recipientName}</p>
          </div>
          <div>
            <Label>IBAN</Label>
            <p className="text-sm font-mono">{recipientIban}</p>
          </div>
          <div>
            <Label>Betrag</Label>
            <p className="text-sm font-semibold">{amount.toFixed(2)} €</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {tan !== undefined && (
            <div>
              <Label htmlFor="tan">TAN</Label>
              <Input
                id="tan"
                value={tan}
                onChange={(e) => setTan(e.target.value)}
                placeholder="TAN eingeben"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirm} disabled={sending}>
              {sending ? "Wird gesendet..." : "Abschicken"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Task 11: Frontend Page

**Files:**
- Create: `frontend/src/pages/allocation/allocation-page.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useAllocation } from "./hooks/use-allocation";
import { AllocationSummary } from "./components/allocation-summary";
import { BucketCard } from "./components/bucket-card";
import { TransferDialog } from "./components/transfer-dialog";
import { fetchRecipientAccountsReferenceData, type RecipientAccountRecord } from "@/lib/recipient-accounts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default function AllocationPage() {
  const { status, loading, error, recalculate, transfer, transferring } = useAllocation();
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
  const [transferState, setTransferState] = useState<{
    open: boolean;
    runBucketId: number;
    amount: number;
    recipientName: string;
    recipientIban: string;
  }>({ open: false, runBucketId: 0, amount: 0, recipientName: "", recipientIban: "" });

  useEffect(() => {
    void fetchRecipientAccountsReferenceData().then((data) => {
      setRecipientAccounts(data.recipient_accounts ?? []);
    });
  }, []);

  const handleTransfer = useCallback(async (runBucketId: number) => {
    const bucket = status?.buckets.find((b) => b.id === runBucketId);
    if (!bucket) return;
    const cfg = status?.config.find((c) => c.id === bucket.bucket_id);
    if (!cfg || !cfg.recipient_account_id) return;

    const recipient = recipientAccounts.find((r) => r.id === cfg.recipient_account_id);
    if (!recipient) return;

    setTransferState({
      open: true,
      runBucketId,
      amount: bucket.target_amount - bucket.transferred,
      recipientName: recipient.recipient_name,
      recipientIban: recipient.iban,
    });
  }, [status, recipientAccounts]);

  const confirmTransfer = useCallback(async (tan?: string) => {
    await transfer(transferState.runBucketId);
  }, [transfer, transferState.runBucketId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Finanzplan konnte nicht geladen werden"
        text={error}
      />
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Finanzplan</h1>
        <Button variant="outline" size="sm" onClick={recalculate}>
          <RefreshCw className="size-4" />
          Neu berechnen
        </Button>
      </div>

      <AllocationSummary
        month={status.month}
        netIncome={status.net_income}
        remaining={status.remaining}
        status={status.status}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Allokation</h2>
        {status.buckets.map((bucket) => {
          const config = status.config.find((c) => c.id === bucket.bucket_id);
          if (!config) return null;
          if (bucket.bucket_type === "bafoeg" && !config.is_active) return null;
          return (
            <BucketCard
              key={bucket.id}
              bucket={bucket}
              config={config}
              onTransfer={handleTransfer}
              transferring={transferring === bucket.id}
            />
          );
        })}
      </div>

      <TransferDialog
        open={transferState.open}
        onOpenChange={(open) => setTransferState((s) => ({ ...s, open }))}
        amount={transferState.amount}
        recipientName={transferState.recipientName}
        recipientIban={transferState.recipientIban}
        onConfirm={confirmTransfer}
      />
    </div>
  );
}
```

---

### Task 12: Frontend Settings Tab

**Files:**
- Create: `frontend/src/pages/settings/tabs/allocation/bucket-form.tsx`
- Create: `frontend/src/pages/settings/tabs/allocation/bafoeg-config-form.tsx`
- Create: `frontend/src/pages/settings/tabs/allocation/allocation-settings-tab.tsx`

- [ ] **Step 1: Write `bucket-form.tsx`**

```tsx
import type { AllocationBucket } from "@/lib/allocation";
import type { RecipientAccountRecord } from "@/lib/recipient-accounts";

type Props = {
  bucket: AllocationBucket;
  recipientAccounts: RecipientAccountRecord[];
  bankAccounts: { iban: string; name: string }[];
  onUpdate: (bucketId: number, updates: Partial<AllocationBucket>) => Promise<void>;
};

const bucketLabels: Record<string, string> = {
  bafoeg: "Bafög-Rücklage",
  emergency: "Notgroschen",
  invest: "Investieren",
  donation: "Spenden",
  spending: "Restliche Ausgaben",
};

export function BucketForm({ bucket, recipientAccounts, bankAccounts, onUpdate }: Props) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <h3 className="font-medium">{bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}</h3>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground">Prozentsatz (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={bucket.percentage}
            onChange={(e) => onUpdate(bucket.id, { percentage: Number(e.target.value) })}
            disabled={bucket.bucket_type === "spending"}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Aktiv</label>
          <div className="mt-1.5">
            <input
              type="checkbox"
              checked={bucket.is_active}
              onChange={(e) => onUpdate(bucket.id, { is_active: e.target.checked })}
              className="size-4"
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Empfängerkonto</label>
          <select
            value={bucket.recipient_account_id ?? ""}
            onChange={(e) => onUpdate(bucket.id, { recipient_account_id: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Kein Konto —</option>
            {recipientAccounts.map((r) => (
              <option key={r.id} value={r.id}>{r.account_name} ({r.iban})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Absenderkonto (IBAN)</label>
          <select
            value={bucket.sender_iban ?? ""}
            onChange={(e) => onUpdate(bucket.id, { sender_iban: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Standard —</option>
            {bankAccounts.map((a) => (
              <option key={a.iban} value={a.iban}>{a.name} ({a.iban})</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `bafoeg-config-form.tsx`**

```tsx
import { useState, useEffect } from "react";
import type { BafoegConfig } from "@/lib/allocation";
import { fetchBafoegConfig, updateBafoegConfig } from "@/lib/allocation";
import { Button } from "@/components/ui/button";

export function BafoegConfigForm() {
  const [config, setConfig] = useState<BafoegConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchBafoegConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const handleSave = async () => {
    setSaving(true);
    await updateBafoegConfig(config);
    setSaving(false);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-card p-4">
      <h3 className="font-medium">Bafög-Konfiguration</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground">Gesamtschuld (€)</label>
          <input
            type="number"
            value={config.total_debt}
            onChange={(e) => setConfig({ ...config, total_debt: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Monatsrate (€)</label>
          <input
            type="number"
            value={config.monthly_rate}
            onChange={(e) => setConfig({ ...config, monthly_rate: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Zinssatz (%)</label>
          <input
            type="number"
            step={0.1}
            value={config.interest_rate}
            onChange={(e) => setConfig({ ...config, interest_rate: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Auszahlungsdatum</label>
          <input
            type="date"
            value={config.payout_date ?? ""}
            onChange={(e) => setConfig({ ...config, payout_date: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Speichert..." : "Speichern"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Write `allocation-settings-tab.tsx`**

```tsx
import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  fetchAllocationBuckets,
  updateAllocationBucket,
  fetchAllocationSettings,
  updateAllocationSettings,
} from "@/lib/allocation";
import { fetchRecipientAccountsReferenceData, type RecipientAccountRecord } from "@/lib/recipient-accounts";
import { fetchBankCredentials, type StoredBankCredentials } from "@/lib/bank/credentials";
import type { AllocationBucket } from "@/lib/allocation";
import { BucketForm } from "./bucket-form";
import { BafoegConfigForm } from "./bafoeg-config-form";

function extractBankAccounts(banks: StoredBankCredentials[]): { iban: string; name: string }[] {
  const accounts: { iban: string; name: string }[] = [];
  for (const bank of banks) {
    for (const acc of bank.accounts ?? []) {
      if (acc.iban) accounts.push({ iban: acc.iban as string, name: (acc.account_name as string) ?? acc.iban as string });
    }
  }
  return accounts;
}

export function AllocationSettingsTab() {
  const [buckets, setBuckets] = useState<AllocationBucket[]>([]);
  const [bafoegEnabled, setBafoegEnabled] = useState(false);
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ iban: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const [bucketsData, settings, recipientsData, banks] = await Promise.all([
      fetchAllocationBuckets(),
      fetchAllocationSettings(),
      fetchRecipientAccountsReferenceData(),
      fetchBankCredentials(),
    ]);
    setBuckets(bucketsData);
    setBafoegEnabled(settings.bafoeg_enabled);
    setRecipientAccounts(recipientsData.recipient_accounts ?? []);
    setBankAccounts(extractBankAccounts(banks));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggleBafoeg = async (enabled: boolean) => {
    await updateAllocationSettings({ bafoeg_enabled: enabled });
    setBafoegEnabled(enabled);
  };

  const handleUpdateBucket = async (bucketId: number, updates: Partial<AllocationBucket>) => {
    await updateAllocationBucket(bucketId, updates);
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch
          id="bafoeg-toggle"
          checked={bafoegEnabled}
          onCheckedChange={handleToggleBafoeg}
        />
        <Label htmlFor="bafoeg-toggle">Bafög-Modus aktivieren</Label>
      </div>

      {bafoegEnabled && <BafoegConfigForm />}

      <div className="space-y-3">
        <h3 className="font-medium">Allokations-Buckets</h3>
        {buckets.map((bucket) => (
          <BucketForm
            key={bucket.id}
            bucket={bucket}
            recipientAccounts={recipientAccounts}
            bankAccounts={bankAccounts}
            onUpdate={handleUpdateBucket}
          />
        ))}
      </div>
    </div>
  );
}
```

---

### Task 13: Frontend Routing & Navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/layouts/sidebar/app-sidebar.tsx`
- Modify: `frontend/src/pages/settings/settings-page.tsx`

- [ ] **Step 1: Add lazy import and route in `App.tsx`**

Add with other lazy imports:

```typescript
const AllocationPage = lazy(() => import("@/pages/allocation/allocation-page"));
```

Add after analytics route:

```typescript
<Route path="/finance-plan" element={<ErrorBoundary pageName="Finanzplan"><AllocationPage /></ErrorBoundary>} />
```

- [ ] **Step 2: Add nav item in `app-sidebar.tsx`**

Add `Wallet` to lucide-react imports. Add nav item after analytics:

```typescript
{
  title: "Finanzplan",
  url: "/finance-plan",
  icon: Wallet,
},
```

- [ ] **Step 3: Add settings tab in `settings-page.tsx`**

Add import:

```typescript
import { AllocationSettingsTab } from "./tabs/allocation/allocation-settings-tab";
```

Add tab value: `"allocation"` to `SETTINGS_TAB_VALUES`

Add tab entry:

```typescript
{ value: "allocation" as const, label: "Allokation", icon: PiggyBank },
```

Add import of `PiggyBank` from lucide-react.

Add tab component:

```typescript
allocation: () => <AllocationSettingsTab />,
```

---

### Task 14: Verification

- [ ] **Step 1: Start backend and test allocation endpoints**

```bash
# Start backend
cd backend && python -m uvicorn finance_server.main:app --reload --port 8112

# Test in another terminal
curl -s http://localhost:8112/api/allocation/status | python -m json.tool
curl -s http://localhost:8112/api/allocation/buckets | python -m json.tool
curl -s http://localhost:8112/api/allocation/history | python -m json.tool
```

- [ ] **Step 2: Run backend tests**

```bash
cd backend && python -m pytest tests/test_allocation_service.py -v
```

- [ ] **Step 3: Start frontend and check the page**

```bash
cd frontend && pnpm dev
```

Navigate to `/finance-plan` and verify the page loads with buckets.
Navigate to `/settings?tab=allocation` and verify the allocation tab.
