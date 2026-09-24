# Manueller Bank-CSV-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manuelle Bankkonten können CSV-Dateien nach einem festen, zentralen Schema importieren, gemappt auf die manuellen `umsaetze`-Spalten.

**Architecture:** Zentrale Schema-Registry + Parser im Backend, zwei API-Endpunkte (Preview/Import) plus Schema-Liste. Frontend-Dialog mit Format-Auswahl, Vorschau und Import; Button bei manuellem Konto. Dedupe über deterministische `transaction_id` + bestehenden `transaction_hash`.

**Tech Stack:** Python/FastAPI, stdlib `csv`/`hashlib`/`re`, raw sqlite3, Pydantic; React 19 + TS, shadcn Dialog/Select/Badge, sonner.

## Global Constraints

- Keine neuen Dependencies (`python-multipart` vorhanden).
- Kein Auto-Anlegen von Kategorien; Name-Match, sonst `kategorie = null`.
- Kein Server-Session-State; Import sendet normalisierte Zeilen zurück.
- Manuelle Buchungen mit `dummy_entry=True`; Konto muss `bank_key == "manual"` sein.
- Deutsche UI-Texte; bestehende Muster beibehalten.
- Deterministische ID: `manual-csv-<sha1(iban|date|amount|recipient|purpose)>`.

---

### Task 1: DB-Helper `existing_transaction_hashes`

**Files:** `backend/finance_server/db/transactions.py` (neu, nach `_find_equivalent_transaction_id`), `backend/finance_server/db/__init__.py` (Import + `__all__`).

**Produces:** `existing_transaction_hashes(hashes: Iterable[str]) -> set[str]` — chunked (500) `SELECT transaction_hash ... IN (...)`.

- [ ] Implementierung + Export ergänzen.
- [ ] Commit.

---

### Task 2: Schema-Registry + Parser

**Files:** Create `backend/finance_server/services/csv_import_service.py`; Test `backend/tests/test_csv_import.py`.

**Produces:** `SCHEMAS`, `list_schemas()`, `parse_csv(content, schema_key, account_iban)`, `_build_row(account_iban, row)`, `parse_amount`, `parse_date`.

- [ ] Failing tests: C24-Mapping (Datum/Betrag/Empfänger/IBAN/Verwendungszweck/Notiz/Kategorie), ungültige Zeile.
- [ ] Modul mit Registry (c24, generic), Decode, Delimiter-Sniff, Header-Mapping, Kategorie-Index/Match, deterministischer ID, Validierung.
- [ ] Tests grün.

---

### Task 3: Preview (Dedupe) + Import

**Files:** `csv_import_service.py` (ergänzen), `transaction_service.py` (Delegation), Tests.

**Produces:** `preview_csv(...) -> dict`, `import_csv(account_iban, rows) -> dict`; `TransactionService.preview_csv_import`, `TransactionService.import_csv_transactions`.

- [ ] Tests: Duplikat-Markierung, `MANUAL_ACCOUNT_REQUIRED`, Insert mit `dummy_entry`.
- [ ] Implementierung + Delegation; Tests grün.

---

### Task 4: API-Endpunkte + Modelle

**Files:** `models/transaction.py` (`CsvImportRow`, `CsvImportRequest`), `api/transactions.py` (3 Routen).

- [ ] `GET /db/transactions/csv-schemas`, `POST /db/transactions/csv-preview` (Multipart), `POST /db/transactions/csv-import` (JSON).
- [ ] Smoke-Test Import.

---

### Task 5: Frontend-API-Client

**Files:** `frontend/src/lib/transactions.ts`.

- [ ] Typen + `fetchCsvSchemas`, `previewCsvImport` (FormData), `importCsvTransactions`.
- [ ] Typecheck.

---

### Task 6: Import-Dialog

**Files:** Create `frontend/src/pages/transactions/components/csv-import-dialog.tsx`.

- [ ] Format-Select, Datei-Input, Vorschautabelle mit Status-Badges, Vorschau-/Import-Button, Toasts.
- [ ] Typecheck.

---

### Task 7: Button in Transaktionsseite

**Files:** `frontend/src/pages/transactions/transactions-page.tsx`.

- [ ] Import + State + zweiter Toolbar-Button („CSV importieren", nur `selectedBank?.manual`) + Dialog-Render.
- [ ] Typecheck + Lint.

---

### Task 8: Verifikation

- [ ] `pytest backend/tests/test_csv_import.py -v` grün.
- [ ] `pnpm --dir frontend exec tsc --noEmit` + Lint grün.
- [ ] Manuell: Vorschau/Import/Dedupe.

## Bekannte Grenzen

- Betrag `1.234` mehrdeutig.
- Import vertraut clientseitig normalisierten Zeilen.
- C24-Format initial angenommen; nur `SCHEMAS["c24"]` anpassen bei Abweichung.
