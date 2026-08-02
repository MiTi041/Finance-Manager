# Rückerstattung: eine Einnahme auf mehrere Ausgaben aufteilen

Datum: 2026-08-02

## Problem

Eine Einnahme (Gutschrift) kann heute über die Spalte `umsaetze.refund_ref_transaction_id` nur Rückerstattung für **eine einzige** Ausgabe sein. Sammel-Rückerstattungen (z. B. ein Shop erstattet 90 €, die sich aus mehreren Käufen zusammensetzen) lassen sich nicht abbilden. Es fehlt die Möglichkeit, eine Einnahme mit anteiligen Beträgen auf mehrere Ausgaben zu verteilen.

## Semantik (vom Nutzer bestätigt)

- Eine Einnahme wird in **Teilbeträgen** auf mehrere Ausgaben verknüpft.
- **Einnahme-Rest** (`Betrag − aufgeteilte Summe`) gilt als echte Einnahme.
- Eine Ausgabe wird durch Rückerstattungen **nie unter 0** reduziert (Über-Erstattung abgelehnt).
- Der "Rückerstattung hinzufügen"-Button wird ausgeblendet, sobald die Einnahme vollständig aufgeteilt ist (Rest = 0).

Beispiel: Ausgaben 30 €, 40 €, 10 €.
- Einnahme 90 € → 30+40+10 verknüpft, 10 € Rest zählen als Einnahme.
- Einnahme 75 € → 30+40+5 verknüpft, die 10-€-Ausgabe wird nur teilweise (5 €) erstattet, 5 € bleiben Ausgabe.

## Modell

Neue Many-to-Many-Tabelle `refund_links` ersetzt `umsaetze.refund_ref_transaction_id`:

```
refund_links(
  id                    INTEGER PRIMARY KEY,
  refund_transaction_id INTEGER NOT NULL,   -- Einnahme (amount > 0)
  expense_transaction_id INTEGER NOT NULL,  -- Ausgabe (amount < 0)
  amount                REAL NOT NULL CHECK (amount > 0),
  created_at            TEXT
)
```

- Index auf `refund_transaction_id` und `expense_transaction_id`.
- `umsaetze.refund_total` bleibt als Cache (= `SUM(refund_links.amount)` je Ausgabe).
- Migration: Bestand aus `refund_ref_transaction_id` übernehmen (amount = voller Betrag), Spalte entfernen (Fallback Table-Rebuild bei altem SQLite).

## Invarianten (Validierung an der API-Grenze)

1. `refund_transaction_id` ist eine Einnahme (`amount > 0`), `expense_transaction_id` eine Ausgabe (`amount < 0`).
2. `amount > 0`.
3. `SUM(amount)` je Einnahme ≤ Einnahmenbetrag (Einnahme wird nie über 0 aufgeteilt).
4. `SUM(amount)` je Ausgabe ≤ `ABS(Ausgabenbetrag)` (Ausgabe fällt nie unter 0).
5. Kein Duplikat (refund, expense)-Paar.

## Backend

### `core/schema.py`

- `create_refund_links_table(connection)` + Indizes.
- Migration `migrate_refund_links(connection)`: Backfill aus `refund_ref_transaction_id` (`amount > 0`), `refund_total` neu berechnen, Spalte `refund_ref_transaction_id` droppen.

### `db/transactions.py`

- `row_to_dict`: statt `refund_ref_transaction_id` → `refund_links: [{id, refund_transaction_id, expense_transaction_id, amount}]` + `refund_attributed` (Summe je Einnahme) + `is_refund` (Einnahme mit ≥ 1 Link).
- `_recalc_refund_total` auf `refund_links` umstellen.
- `update_transaction_refund_link` → `add_refund_link`/`delete_refund_link` mit Invarianten-Prüfung; Recalc für betroffene Einnahme + Ausgabe.
- `delete_transaction`/`delete_transactions_batch`: Links der gelöschten Transaktion entfernen, `refund_total` betroffener Gegenseite neu berechnen.

### `api/transactions.py` + `models/transaction.py`

- `POST /db/transactions/{id}/refund-links` `{expense_transaction_id, amount}`.
- `DELETE /db/transactions/{id}/refund-links/{link_id}`.
- Alt-Endpoint `PATCH …/refund-link` entfällt.

### `db/sync.py`

- `refund_ref_transaction_id` aus dem Column-Set entfernen.

### Auswertungen (Refund-Erkennung Spalte → Links)

| Datei | Änderung |
|---|---|
| `db/analytics.py` (5 Queries) | Einnahme-CASE: `amount − SUM(refund_links.amount)`; Ausgabe bleibt `ABS(amount) − refund_total` |
| `services/allocation_service.py` (~187, 292, 351) | `refund_ref_transaction_id`-Prüfung → `EXISTS`/Subquery auf `refund_links`; `refund_total` bleibt |
| `services/subscription_service.py` | Refund-Aggregation über `refund_links` |
| `db/budgets.py` | unverändert (nutzt `refund_total`) |

## Frontend

### Typen / Mapper

- `types/transaction.ts`: `refundRefTransactionId` → `refundLinks: RefundLink[]` + `refundAttributed`.
- `mappers.ts`: Mapping der neuen Felder.
- `lib/transactions.ts`: `addRefundLink`/`removeRefundLink` statt `updateRefundLink`.

### `refund-section.tsx`

- **Incoming:** Liste der Links (Ziel, Betrag, Löschen); Anzeige "Rest: X €"; Hinzufügen = Ausgabe wählen → Betrag eingeben (Default/Max = `min(Einnahme-Rest, Ausgaben-Rest)`); Button ausgeblendet wenn Einnahme-Rest = 0.
- **Outgoing:** Link-Beträge statt Vollbeträge der Einnahmen anzeigen.

### Ableitungen

- `use-transaction-derivations.ts`: `isRefund`, `linkedRefundTotal`, `refundRemaining`, `showRefundSection`, `displayAmount` aus `refundLinks`.
- Analytics-Hooks `use-finance-data.ts`, `use-categories.ts`, `use-partner-analytics.ts`: `isRefund → 0` wird `wert − refundAttributed`.

## Tests

- `test_budgets.py`: `test_over_refunded_transaction_counts_as_negative_spend` entfällt (Über-Erstattung unmöglich) → ersetzt durch "Refund bis exakt 0".
- Neue Tests (`test_refund_links.py` o. Ä.):
  - Link hinzufügen/entfernen + `refund_total`-Recalc.
  - Über-Aufteilung der Einnahme abgelehnt.
  - Über-Erstattung der Ausgabe abgelehnt.
  - Partielle Erstattung: 90 € → 10 € Einnahme-Rest; 75 € → 5 € Ausgaben-Rest (Analytics).
  - Löschen einer Einnahme entfernt ihre Links.

## Nicht im Scope

- Keine Änderung an Split-/Kategorie-Logik (`splits`).
- Eimer/Allocation-Buchungslogik unverändert (nur Refund-Erkennung).
