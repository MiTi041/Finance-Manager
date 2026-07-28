# Notgroschen Ziel & Restmonate — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add target/goal configuration and months-remaining display to the emergency fund bucket.

**Architecture:** Backend calculates all-time saved amount (via `tag.notfallfonds`), goal, and months-left; frontend displays it on the bucket card and configures it via the popover.

**Tech Stack:** Python/FastAPI + SQLite, React/TypeScript + shadcn/ui

## Global Constraints

- Ponytail mode: shortest working diff, no unrequested abstractions

---

### Task 1: DB Migration — `target_amount` / `target_months` columns

**Files:**
- Modify: `backend/finance_server/core/schema.py`

**Steps:**
- Add `_ensure_table_columns` call for `allocation_buckets` with `target_amount REAL` and `target_months REAL`

### Task 2: Backend — all-time saved + goal calculation

**Files:**
- Modify: `backend/finance_server/services/allocation_service.py`

**Steps:**
- `_build_run_response`: calculate all-time `tag.notfallfonds` balance (negative = sparen, positive = entnehmen)
- Calculate goal from `target_months × net_income` or `target_amount`
- Calculate `months_left = ceil(max(0, goal - saved) / monthly_rate)`
- Return `saved_total`, `goal_amount`, `goal_months`, `months_left` in bucket dict

### Task 3: Frontend — bucket card goal display

**Files:**
- Modify: `frontend/src/pages/allocation/components/bucket-card.tsx`

**Steps:**
- Show goal section on emergency bucket card: saved vs goal + progress bar
- Show "Noch ~X Monate bei aktueller Rate"
- Popover: add "Sparziel" section with target_amount / target_months inputs

### Task 4: Frontend — popover goal config

**Steps:**
- Add target_amount and target_months fields in bucket popover (only for emergency)
- Mutually exclusive: setting one clears the other
- Save via existing `onUpdateConfig`
