# Vorgemerkte Transaktionen (pending) — Design

Datum: 2026-08-03
Status: genehmigt

## Ziel

FinTS "Nicht gebuchte Umsätze" (vorgemerkte Transaktionen) in der App als eigene
Sektion oberhalb der gebuchten Liste anzeigen.

## Entscheidungen

- **Transient pro Sync:** Pending ist flüchtig. Jede Synchronisierung ersetzt die
  Sektion komplett. Keine History, kein Matching zu gebuchten Sätzen.
- **Eigene Sektion** oberhalb der gebuchten Liste, kein Filter.

## Backend

1. `backend/fints/client.py` — `_get_transactions_mt940` parst `statement_booked`
   und `statement_pending` getrennt (nicht mehr gemischt) und setzt
   `data["is_pending"] = True` auf pending-Einträgen. CAMT-Pfad genauso.
   `get_transactions(include_pending=True)` bleibt die einzige Schnittstelle.
2. `backend/finance_server/fints/transactions.py:124` — Call um
   `include_pending=True` erweitern; pending von booked trennen (anhand
   `is_pending`).
3. Neue Tabelle `vorgemerkte_umsaetze` (`core/schema.py`) — gleiche Spalten wie
   `umsaetze`, ohne UNIQUE `transaction_hash`. Bei jedem Sync: DELETE + Insert.
   `to_row_payload()` wird wiederverwendet → gleiches Format fürs Frontend-Mapping.
4. `GET /db/transactions` (`api/transactions.py:15`) — Response um `pending` und
   `pending_count` erweitern.

## Frontend

5. `use-transactions.ts` — liest `payload.pending`, mappt über denselben
   `mapTransaction`. `useFinanceData` reicht `pendingTransactions` durch.
6. `transactions-page.tsx` — "Vorgemerkt"-Sektion oberhalb der gebuchten Liste,
   nur sichtbar wenn pending-Daten vorhanden sind.

## Risiken / offene Punkte

- MT940-Banken liefern pending oft gar nicht → Sektion erscheint dann nicht (OK).
- Pending-Sätze haben oft kein `entry_date` → Sortierung nach `date`/`created_at`,
  Mapping toleriert leere Felder.
