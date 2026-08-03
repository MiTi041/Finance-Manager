# Jährliche Budgets

Datum: 2026-08-03
Status: Approved

## Ziel

Zusätzlich zu Monatsbudgets Jahresbudgets mit eigenem Jahresziel anlegen (z.B. Versicherungen 800 €/Jahr), die im selben Raster auf der Budget-Seite erscheinen.

## Entscheidungen

- **Eigener Budgettyp**: ein Budget ist entweder `monthly` oder `yearly`; der Betrag ist das Ziel für den jeweiligen Zeitraum.
- **Gleiche Tabelle**: `budgets` bekommt `period` (`'monthly'|'yearly'`), `monthly_amount` wird zu `amount` umbenannt. Ein Row-Typ, eine Spent-Logik, nur anderer Zeitraum.
- **Alles im selben Raster**: keine Umschaltung, keine getrennte Seite; Jahresbudgets tragen ein Badge „Jahr".
- **Jährlich = YTD**: Ausgaben zählen vom Januar des selektierten Jahres bis zum selektierten Monat (Stichtag) → zeigt „auf Kurs", nicht Jahreszielbruch.
- **Kategorie pro Period exklusiv**: dieselbe Kategorie darf in einem Monats- UND einem Jahresbudget sein, aber nicht in zwei Budgets desselben Period-Typs.
- **Monats-Navigation steuert Jahres-Stichtag**: kein separater Jahres-Picker; der Monat, auf dem man steht, bestimmt Jahr + Stichtag für Jahresbudgets.

## Datenmodell

```sql
CREATE TABLE budgets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL DEFAULT '',
    category_ids   TEXT NOT NULL,
    amount         REAL NOT NULL CHECK(amount >= 0),
    period         TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly', 'yearly')),
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

- Migration in `core/schema.py:create_budgets_table`: wenn `monthly_amount` oder altes `category_id` existiert → Rebuild nach bestehendem Muster (`budgets_old`), dabei `monthly_amount → amount`, `period = 'monthly'`. `_ensure_table_columns` fügt `period` als Fallback hinzu.
- Sync: `db/sync.py` Spalten-Set `{"id", "name", "category_ids", "amount", "period", "created_at", "updated_at"}`.

## Spent-Berechnung

`_fetch_spent(conn, category_ids, month)` wird period-abhängig:

- **monthly**: unverändert `strftime('%Y-%m', COALESCE(entry_date, date, substr(created_at,1,10))) = :month`.
- **yearly**: Jahr des selektierten Monats als Stichtag:
  `strftime('%Y', COALESCE(...)) = :year AND CAST(strftime('%m', COALESCE(...)) AS INTEGER) <= :month_of_selected`.

Refund-Bereinigung wie bisher (`amount + refund_total`, nur `amount < 0`).

## API

Response-Felder: `monthly_amount` → `amount`, neu `period`. `GET /api/db/budgets?month=YYYY-MM` liefert beide Typen; Jahresbudgets mit `spent`/`remaining`/`is_over` bezogen auf den Stichtag des Monats.

- `POST /api/db/budgets` `{name, category_ids, amount, period}` (period default `monthly`)
- `PUT /api/db/budgets/{id}` `{name?, category_ids?, amount?, period?}`
- `DELETE /api/db/budgets/{id}` unverändert

Validierung: `period in ('monthly', 'yearly')`; Kategorie-Verfügbarkeit nur innerhalb desselben Period-Typs prüfen (`_validate_categories` mit period).

Dateien: `models/budget.py`, `db/budgets.py`, `api/budgets.py`.

## Frontend

- `lib/budgets.ts`: Typen `amount`/`period`, API-Calls entsprechend.
- `pages/budgets/budgets-page.tsx`: Header-Summen (`amount` statt `monthly_amount`), weiterhin ein Raster.
- `components/budget-card.tsx`: Badge „Jahr" bei `period === 'yearly'`.
- Dialoge (`add-budget-dialog.tsx`, `edit-budget-dialog.tsx`): Period-Umschalter Monat/Jahr; `existingCategoryIds` filtert nur Kategorien, die bereits im gewählten Period-Typ vergeben sind.
- Leerer Zustand: Text um Jahresbudgets ergänzen.

## Bewusst weggelassen (YAGNI)

- Eigene Jahres-Navigation / Jahres-Picker.
- Rollover für Jahresbudgets.
- Drilldown zu Transaktionen pro Budget.
