# Donation Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an analysis button on the donation bucket card showing per-account donation breakdown with bank logos.

**Architecture:** Backend queries `umsaetze` transactions matching `tag.spenden` purpose or donation-account IBANs, groups by matched donation account. Frontend shows results in a Dialog with BankLogo per entry.

**Tech Stack:** FastAPI (Python), SQLite, React/TypeScript, shadcn/ui Dialog, BankLogo component

**File Structure:**
- `backend/finance_server/api/allocation.py` — new `GET /allocation/donation-analytics` endpoint
- `backend/finance_server/services/allocation_service.py` — new `get_donation_analytics()` method
- `frontend/src/lib/allocation.ts` — new `fetchDonationAnalytics()` + types
- `frontend/src/pages/allocation/components/donation-analysis-dialog.tsx` — new Dialog component
- `frontend/src/pages/allocation/components/bucket-card.tsx` — add "Analyse" button for donation type
- `frontend/src/pages/allocation/allocation-page.tsx` — wire dialog + fetch data

## Global Constraints
- Follow existing code patterns (same imports, same styling)
- No DB migration — matching from existing data only
- Use `BankLogo` component for account logos
- "Andere" for unmatched transactions

---

### Task 1: Backend — donation-analytics API

**Files:**
- Modify: `backend/finance_server/db/allocation.py` — add `get_donation_transactions()`
- Modify: `backend/finance_server/services/allocation_service.py` — add `get_donation_analytics()`
- Modify: `backend/finance_server/api/allocation.py` — add `GET /allocation/donation-analytics`

**Interfaces:**
- Produces: `GET /allocation/donation-analytics` → `{ accounts: DonationAccountBreakdown[], total: number }`
- `DonationAccountBreakdown = { account_name, recipient_name, iban, total, count, percentage, logo_url?, logo_white_background?, logo_padding? }`

**Steps:**
1. Add `get_donation_transactions()` to `db/allocation.py` — query `umsaetze` for outgoing txns with `purpose LIKE '%tag.spenden%'` or IBAN matching donation accounts, return list
2. Add `get_donation_analytics()` to `allocation_service.py` — load donation accounts, match transactions, group, return breakdown with "Andere" fallback
3. Add `GET /allocation/donation-analytics` endpoint to `api/allocation.py`
4. Run backend tests: `cd backend && python -m pytest tests/ -x -q`

### Task 2: Frontend — fetch + types

**Files:**
- Modify: `frontend/src/lib/allocation.ts` — add `DonationAnalyticsAccount` type and `fetchDonationAnalytics()`

**Steps:**
1. Add `DonationAnalyticsAccount` type with all needed fields
2. Add `fetchDonationAnalytics()` API function

### Task 3: Frontend — DonationAnalysisDialog

**Files:**
- Create: `frontend/src/pages/allocation/components/donation-analysis-dialog.tsx`

**Steps:**
1. Create Dialog component with:
   - Header "Spenden-Analyse"
   - List of accounts with BankLogo, name, amount, percentage bar
   - "Andere" entry if present
   - Total sum footer
2. Use existing patterns from `analytics-page.tsx` (LegendRow style) and `transfer-dialog.tsx` (Dialog pattern)

### Task 4: Frontend — wire into BucketCard

**Files:**
- Modify: `frontend/src/pages/allocation/components/bucket-card.tsx`
- Modify: `frontend/src/pages/allocation/allocation-page.tsx`

**Steps:**
1. Add "Analyse" button on donation bucket card (next to settings gear or below the progress bar)
2. Wire up dialog open/close + fetch in `BucketCard` or `AllocationPage`