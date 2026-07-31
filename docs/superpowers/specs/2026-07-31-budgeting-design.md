# Budgetierung

Datum: 2026-07-31
Status: Approved

## Ziel

Monatliche Budgets pro Kategorie (z.B. Lebensmittel 100 €, Freizeit 50 €) mit Live-Erfassung der tatsächlichen Ausgaben gegen das Budget.

## Entscheidungen

- **Neue Seite** "Budgets" in der Sidebar (nicht im Finanzplan). Finanzplan = Spar-/Allokationsseite, Budgets = Ausgabenseite.
- **Monatlich wiederkehrend**: ein Betrag pro Kategorie, gilt jeden Monat. Kein per-Monat-Override.
- **Kein Rollover**: nicht ausgegebenes Budget verfällt am Monatsende.
- **Beliebige Kategorie-Ebene**: Budget kann auf Haupt- oder Unterkategorie gesetzt werden; ausgegeben = Summe der Transaktionen in der Kategorie **inkl. aller Unterkategorien** (rekursive CTE).
- **Über alle Konten** (Kategorien sind global). Aktive Kontoauswahl wird ignoriert.
- **Warnung**: Fortschrittsbalken (grün <70 %, gelb 70–100 %, rot >100 %) + Sidebar-Badge mit Anzahl überzogener Budgets.

## Datenmodell

```sql
CREATE TABLE IF NOT EXISTS budgets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id    INTEGER NOT NULL UNIQUE,
    monthly_amount REAL NOT NULL CHECK(monthly_amount >= 0),
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES kategorien(id) ON DELETE CASCADE
);
```

- Anlegen in `core/schema.py` (`create_budgets_table`) + Aufruf in `initialize_database`.
- Sync: Tabelle in `db/sync.py` Registry (Tabellenliste + Spalten-Set) aufnehmen; CRUD-Logging via `log_crud_event`, Muster wie `db/savings.py`.

## Ausgaben-Berechnung (Live, pro Monat)

Für Monat `YYYY-MM`: Kategorie + alle Nachfahren via rekursive CTE über `kategorien.parent_id`; Summe der Ausgaben in `umsaetze` mit `strftime('%Y-%m', COALESCE(entry_date, date, substr(created_at,1,10))) = :month`, refund-bereinigt — gleiche Logik wie `db/analytics.py:156`:

```
CASE WHEN u.amount < 0 THEN u.amount + COALESCE(u.refund_total, 0) ELSE 0 END
```

`spent = ABS(Summe)`, `remaining = monthly_amount - spent`, `is_over = remaining < 0`.

## API

- `GET /api/db/budgets?month=YYYY-MM` → `[{id, category_id, name, icon, monthly_amount, spent, remaining, is_over}]` (nur Ausgabe-Kategorien relevant, sortiert nach Name)
- `POST /api/db/budgets` `{category_id, monthly_amount}` (409 bei doppelter Kategorie)
- `PUT /api/db/budgets/{id}` `{monthly_amount}`
- `DELETE /api/db/budgets/{id}`

Dateien: `models/budget.py` (Pydantic), `db/budgets.py`, `api/budgets.py`.

## Frontend

- Route `/budgets` in `App.tsx`, Sidebar-Eintrag in `app-sidebar.tsx` (Icon z.B. `PiggyBank`/`Target`), Breadcrumb in `breadcrumb.tsx`.
- `lib/budgets.ts`: API-Calls + Typen.
- Seite `pages/budgets/budgets-page.tsx`:
  - Header-Karte: Gesamtbudget, ausgegeben, übrig (Monat).
  - Monats-Navigation (aktueller Monat default, zurück blättern).
  - Budget-Karten-Liste: Icon + Name, Betrag inline editierbar, Fortschrittsbalken, Restbetrag.
  - "Budget hinzufügen"-Dialog: Kategorie-Picker (nur Ausgabe-Kategorien, ohne solche mit existierendem Budget), Betrag.
- Sidebar-Badge: Anzahl überzogener Budgets im aktuellen Monat (Fetch neben den bestehenden Sidebar-Fetches).

## Bewusst weggelassen (YAGNI)

- Rollover, per-Monat-Budgets, Budget-Vorschlag aus Durchschnitt, Drilldown zu Transaktionen pro Budget, Budgets pro Konto.
