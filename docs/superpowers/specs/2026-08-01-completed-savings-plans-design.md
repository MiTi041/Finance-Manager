# Abgeschlossene Sparpläne — Design

**Datum:** 2026-08-01
**Status:** Approved

## Ziel

Ein Sparplan gilt als abgeschlossen, sobald sein gesamtes Sparziel erreicht ist. Er wird als
„Abgeschlossen" angezeigt, läuft nicht mehr in die Berechnungen ein und zeigt keinen
Zahl-Button mehr. Der Nutzer kann ihn bei Bedarf weiterhin löschen.

## Erkennung

Rein rechnerisch, kein neues DB-Feld:

> `is_completed = target_amount > 0 und saved_amount >= target_amount`

Fällt `saved_amount` später durch Entnahmen wieder unter das Ziel, wird der Plan automatisch
wieder aktiv.

## Backend

`backend/finance_server/services/allocation_service.py`:

- `_enrich_savings_plan`: Feld `is_completed` zum enriched Payload hinzufügen. `required_rate`
  ist dort bereits `0.0`, wenn nichts mehr fehlt → `monthly_rate` wird automatisch `0`.
- `get_or_create_run` (Zeile ~138) und `_build_run_response` (Zeile ~285):
  `savings_total` summiert nur noch Pläne mit `not p["is_completed"]`.

## Frontend

- `frontend/src/lib/allocation.ts`: Feld `is_completed: boolean` zum `SavingsPlan`-Typ.
- `frontend/src/pages/allocation/components/savings-plans-card.tsx`: Bei `plan.is_completed`
  wird der gesamte Pay-Bereich (Slider + „jetzt zahlen"-Button) durch einen grünen
  „Abgeschlossen"-Badge ersetzt. Das Menü (Bearbeiten / An-/Ausblenden / Löschen) bleibt.

## Bewusst nicht enthalten

- Keine DB-Migration, kein manueller Schalter.
- Kein Backend-Guard gegen Transfers auf abgeschlossene Pläne — die UI ist der einzige
  Einstiegspunkt für Transfers.

## Tests

Backend: `test_allocation_service.py` bekommt einen Fall, dass ein Plan mit `saved_amount >=
target_amount` als `is_completed` markiert ist und nicht in `savings_total` zählt.
