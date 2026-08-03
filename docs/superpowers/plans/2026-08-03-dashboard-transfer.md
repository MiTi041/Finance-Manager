# Dashboard-Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Von der Gesamtvermögen-Karte aus eine direkte SEPA-Überweisung von einem Transfer-aktiven Konto auslösen.

**Architecture:** Keine Backend-Änderungen — `POST /api/transfer` existiert bereits. Neu: `executeDirectTransfer()`-Lib, Setup-Dialog, Button auf der Karte. Betrag via `PayoutSlider`, Bestätigung via `TransferDialog`.

**Tech Stack:** React 19, TypeScript, Tailwind, Radix Dialog/Popover, `node --test`.

## Global Constraints

- Deutschsprachige UI-Texte.
- Keine neuen Dependencies.
- Wiederverwenden: `PayoutSlider`, `TransferDialog`, `SearchableSelect`, `createRecipientAccount`, `formatAmount`, `normalizeIban`.
- TAN-Fehler: `TanRequiredError` aus `@/lib/allocation` (TransferDialog prüft per `instanceof`).
- Tests: `node --test src/lib/*.test.ts` (aus `frontend/`).
- Commits: Conventional Commits, nur eigene Dateien stagen (Repo enthält fremde WIP-Änderungen).

---

### Task 1: IBAN-Validierung + Transfer-Request-Builder

**Files:**
- Create: `frontend/src/lib/transfer-utils.ts` (dependency-frei: `isValidIban`, `buildTransferRequestBody`, `DirectTransferPayload`)
- Create: `frontend/src/lib/direct-transfer.ts` (`executeDirectTransfer` — POST `/transfer`, 409-TAN-Handling, `emitReferenceChange`)
- Test: `frontend/src/lib/direct-transfer.test.ts`

**Steps:**
- [x] Test schreiben (Checksumme, Body-Mapping).
- [x] `transfer-utils.ts` + `direct-transfer.ts` implementieren.
- [x] `node --test src/lib/direct-transfer.test.ts` grün.
- [x] Commit: `feat(dashboard): add IBAN validation and direct transfer api`

### Task 2: StatCard action-Prop

**Files:**
- Modify: `frontend/src/pages/dashboard/components/stat-card.tsx`

**Steps:**
- [x] `action?: ReactNode` im Header-Row (nach Titel, vor Icon).
- [x] `pnpm --dir frontend build` ok.
- [x] Commit: `feat(dashboard): support action slot on stat card`

### Task 3: Transfer-Setup-Dialog

**Files:**
- Create: `frontend/src/pages/dashboard/components/transfer-setup-dialog.tsx`

**Steps:**
- [x] Absender-Dropdown (nur Transfer-aktive, Balance sichtbar, vorbelegt).
- [x] Empfänger (gespeichert + eigene + manuell mit „speichern"-Checkbox).
- [x] Verwendungszweck-Feld, PayoutSlider 0–Kontostand (Klemmen bei Absenderwechsel).
- [x] „Ja, bezahlen"-Validierung, State-Reset beim Öffnen.
- [x] Build ok. Commit: `feat(dashboard): add transfer setup dialog`

### Task 4: Dashboard-Verkabelung

**Files:**
- Modify: `frontend/src/hooks/use-finance-data.ts` (gibt `linkedBanks` zurück)
- Modify: `frontend/src/pages/dashboard/dashboard-page.tsx`

**Steps:**
- [x] `canTransferMap` + `recipientAccounts` laden; `senderAccounts`/`ownAccounts` bauen.
- [x] StatCard `action`-Button „Überweisen" (nur wenn `senderAccounts.length > 0`).
- [x] Setup-Dialog → bei `saveRecipient` `createRecipientAccount` (best-effort) → `pendingTransfer` → TransferDialog.
- [x] TransferDialog `onConfirm` → `executeDirectTransfer` + Toast + `triggerRefresh()`.
- [x] Build + ESLint ok; Backend-Vertrag geprüft (422 auf leeren Body; `can_transfer`-Flags korrekt).
- [x] Commit: `feat(dashboard): transfer from total assets card`

---

**Verifikation:** Unit-Test, `pnpm --dir frontend build`, ESLint, Vite-Modul-Transformation (200), Backend-Vertragstest. Browser-Test ausstehend, da Playwright-Chrome nicht installierbar (sudo nötig).
