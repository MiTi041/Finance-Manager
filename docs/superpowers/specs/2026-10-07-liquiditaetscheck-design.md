# Liquiditätscheck — Design

Datum: 2026-10-07

## Ziel

Eine neue Seite `/liquidity` („Liquiditätscheck"), auf der man prüft, ob man bis zu
einem frei wählbaren Enddatum liquide bleibt. Man pflegt manuelle Einnahmen und
Ausgaben (z. B. „Geschenke 100 €") und markiert sie als **sicher** oder
**erwartet**. Zusätzlich fließen laufende Abos und vorgemerkte Transaktionen
optional automatisch ein. Ergebnis: gedeckt / nur im Best Case gedeckt / nicht
gedeckt, plus konkrete Differenz.

## Nicht im Scope

- Keine benannten Szenarien/Versionen (ein einziger Plan).
- Kein Einzeldatum pro manuellem Posten (alles zählt im Zeitraum).
- Keine Per-Posten-Deaktivierung der Auto-Quellen (nur globale Toggles).

## Datenmodell

Neue Tabelle `liquidity_entries` (idempotentes DDL in `core/schema.py`,
Registrierung in `initialize_database`):

| Spalte       | Typ                                                     |
|--------------|---------------------------------------------------------|
| id           | INTEGER PK AUTOINCREMENT                                |
| label        | TEXT NOT NULL                                            |
| amount       | REAL NOT NULL CHECK(amount >= 0)                         |
| kind         | TEXT NOT NULL CHECK(kind IN ('income','expense'))        |
| certainty    | TEXT NOT NULL CHECK(certainty IN ('certain','expected')) |
| created_at   | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP                  |
| updated_at   | TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP                  |

## Backend

Muster analog `budgets` (kleines CRUD):

- `api/liquidity.py` — `router = APIRouter()`:
  - `GET /db/liquidity-entries` → `{ entries: [...] }`
  - `POST /db/liquidity-entries` → angelegter Eintrag
  - `PUT /db/liquidity-entries/{id}` → aktualisierter Eintrag (404 wenn unbekannt)
  - `DELETE /db/liquidity-entries/{id}` → `{ deleted: true }` (404 wenn unbekannt)
- `db/liquidity.py` — Validierung (`label` nicht leer, `amount >= 0`, `kind` und
  `certainty` aus dem erlaubten Set), `log_crud_event("liquidity_entries", ...)`.
- `models/liquidity.py` — `LiquidityEntryCreateRequest` (label, amount, kind,
  certainty) und `LiquidityEntryUpdateRequest` (alle Felder optional).
- `main.py` — Import + `app.include_router(liquidity_router, prefix="/api")`.

## Frontend

Dateien:

- `lib/liquidity.ts` — Typen (`LiquidityEntry`, `LiquidityKind`,
  `LiquidityCertainty`) und API-Client (`fetchLiquidityEntries`,
  `createLiquidityEntry`, `updateLiquidityEntry`, `deleteLiquidityEntry`).
- `pages/liquidity/liquidity-page.tsx` — Seite.
- `pages/liquidity/utils.ts` — reine Rechenlogik `computeLiquidity(...)` +
  `projectSubscriptions(...)`.
- `pages/liquidity/hooks/use-liquidity.ts` — lädt Einträge, Kontostände, Abos
  und vorgemerkte Transaktionen, projiziert Auto-Quellen, stellt Mutationen bereit.
- `pages/liquidity/components/` — `entry-row.tsx` / `add-entry-form.tsx` /
  `result-card.tsx` / `auto-items.tsx` (so viele wie nötig, so wenige wie möglich).

Route in `App.tsx` (`/liquidity`, `ErrorBoundary pageName="Liquiditätscheck"`)
und Sidebar-Eintrag in `app-sidebar.tsx` (`{ title: "Liquiditätscheck",
url: "/liquidity", icon: ... }`, z. B. `PiggyBank`).

### Seite (clean, minimalistisch)

Bestehende UI-Bausteine verwenden (`Card`, `Button`, `Input`, `Label`, `Switch`,
`DatePicker`, `Badge`, `EmptyState`, `toast`/sonner, `formatAmount`).

1. **Kopf-Karte**: Startliquidität (`Input`, Default = Summe Kontostände,
   überschreibbar) + Enddatum (`DatePicker`, Default 31.12. laufendes Jahr).
2. **Ergebnis-Karte**: Status-Badge farbig (grün „Garantiert gedeckt" / amber
   „Nur im Best Case" / rot „Nicht gedeckt"), große Kennzahl = Differenz,
   darunter aufgeschlüsselt: sicher verfügbar, erwartet, Best Case.
3. **Toggles**: „Laufende Abos einbeziehen", „Vorgemerkte Transaktionen
   einbeziehen" (Default: an).
4. **Manuelle Posten**: kompakte Liste (Label, +/−-Betrag, sicher/erwartet),
   Bearbeiten/Löschen; darunter ein einzeiliges Anlege-Formular
   (Label, Betrag, Einnahme/Ausgabe, sicher/erwartet).
5. **Automatische Posten** (read-only): Abos im Zeitraum und vorgemerkte
   Transaktionen, jeweils mit Label, Datum und Betrag.

## Rechenlogik

Projektion (beide Auto-Quellen gelten als **sicher**):

- **Abos**: ein `GET /db/subscriptions`-Aufruf, dann ab `nextDate` in Schritten
  der Frequenz (MONTHLY +1 Monat, SEMI_ANNUAL +6, ANNUAL +1 Jahr) bis zum
  Enddatum aufaddieren. Vorzeichen aus `direction`, Betrag = `effectiveAmount ??
  amount`. Label = `name`.
- **Vorgemerkte Transaktionen**: alle offenen (nicht gebuchten) mit Datum ≤
  Enddatum; Betrag vorzeichenbehaftet (`amount`; negativ = Ausgabe). Label =
  Verwendungszweck/Name.

Startliquidität nutzt den **gebuchten** Kontostand (`balance`), nicht
`balance_pending`, damit vorgemerkte Posten nicht doppelt zählen.

Aggregation:

```
certainIncome   = Σ manuell(income, certain) + Σ auto(+) 
certainExpense  = Σ manuell(expense, certain) + Σ auto(-)
expectedIncome  = Σ manuell(income, expected)
expectedExpense = Σ manuell(expense, expected)

certainBalance = start + certainIncome - certainExpense
bestBalance    = certainBalance + expectedIncome - expectedExpense
```

Status und Differenz:

| Bedingung                        | Status              | Differenz        |
|----------------------------------|---------------------|------------------|
| `certainBalance >= 0`            | garantiert gedeckt  | `certainBalance` (Überschuss) |
| `certainBalance < 0 <= bestBalance` | nur Best Case    | `certainBalance` (Lücke) |
| `bestBalance < 0`                | nicht gedeckt       | `bestBalance`    |

`computeLiquidity` gibt alle Einzelposten (certainIncome/Expense,
expectedIncome/Expense, certainBalance, bestBalance, status, discrepancy)
zurück, damit die Ergebnis-Karte alles ohne Nachrechnen anzeigen kann.

## Tests

`pages/liquidity/utils.test.ts` als reines `node:assert`-Skript (wie
`src/lib/allocation-overview.test.ts`, ausgeführt mit `node --test`):
feste Eingaben für die drei Status-Fälle, Kontrolle von Überschuss und Lücke;
ein Fall mit Abo-Projektion über mehrere Monate.

## Verifikation

- Aus `frontend/`: `node --test src/pages/liquidity/utils.test.ts` und
  `npx tsc --noEmit` (bzw. vorhandener Lint-Lauf).
- Backend: Validierung/CRUD per manuellem Endpunkt-Smoke-Test.
