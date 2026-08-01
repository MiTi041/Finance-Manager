# Income-Events-Anzeige: nur zukünftige Einkommen

## Problem

Die UI zeigt unter „Erwartete Einkommen bis Zieldatum" `income_events_left`,
das neben den zukünftigen Einkommen auch einen Bonus `+1` enthält (das bereits
erhaltene Einkommen des Vormonats finanziert den aktuellen Monat). Für den
Nutzer ist dieses Einkommen kein „erwartetes" mehr.

Konkret am 1.8. (Auszahlung 28. des Monats):
- Ziel 31.08. → Anzeige 2, real erwartet nur 1 (28.08.)
- Ziel 16.08. → Anzeige 2, real erwartet 0 (28.08. liegt nach dem Ziel)

Zusätzlich erzwingt `count_income_events_until` ein Minimum von 1
(`max(1, result)`), das bei Ziel vor dem nächsten Auszahlungstag einen
Phantom-Einkommen erzeugt. Für Ziel 16.08. ist damit selbst die
Raten-Basis falsch: `max(1, 0) + 1 = 2`, korrekt wäre `0 + 1 = 1`.

## Entscheidung

Die Anzeige zeigt nur zukünftige Einkommen („erwartete Einkommen" wörtlich).
Die Ratenberechnung bleibt unverändert am Bonus-Modell, bekommt aber die
Phantom-Korrektur.

## Lösung

### Semantik

- **Neu** `future_income_events`: echte zukünftige Einkommen vom 1. des
  Monats bis Zieldatum, ohne Bonus, ohne Minimum. Wird in der UI angezeigt.
- `income_events_left` bleibt Basis der Ratenberechnung, korrigiert von
  `max(1, future) + bonus` → `max(1, future + bonus)`.

Ergebnis: Ziel 31.08. → Anzeige 1, Rate-Basis 2 (unverändert).
Ziel 16.08. → Anzeige 0, Rate-Basis 1 (korrigiert).

### Backend

1. `db/savings.py` `count_income_events_until`: neuer Parameter
   `min_result: int = 1`; `return max(min_result, result)` und
   `if td <= now: return min_result`. Bestehende Caller unverändert.
2. `allocation_service.py` `_enrich_savings_plan`:
   `future = count_income_events_until(..., min_result=0)`;
   `income_events_left = max(1, future + bonus)`;
   Return um `future_income_events` erweitert.
3. `allocation_service.py` Bafög-Bucket: analog,
   `income_events_left = max(1, future + 1)`, Feld `future_income_events`.

### Frontend

4. `lib/allocation.ts`: `future_income_events?: number | null` in
   `AllocationRunBucket` und `SavingsPlan`.
5. `utils.ts` `countIncomeEventsUntil`: Spiegel-Parameter `minResult = 1`.
6. `savings-plans-card.tsx`: Anzeige nutzt `plan.future_income_events`;
   Form-Vorschau nutzt `minResult=0`; `computeMonthlyRate` gespiegelt
   `max(1, future + (isFirstMonth ? 0 : 1))`.
7. `bucket-card.tsx` + `bucket-details.tsx`: Bafög-Detail nutzt
   `future_income_events`.

Labels bleiben unverändert („erwartete Einkommen" stimmt jetzt wörtlich).
