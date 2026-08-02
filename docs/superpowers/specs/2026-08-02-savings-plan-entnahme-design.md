# Sparplan: Entnahme & Verschuldung

Datum: 2026-08-02

## Problem

Geld aus einem Sparplan wird für den Zweck des Plans entnommen (z. B. Flug bezahlen bei Urlaubs-Sparplan). Aktuell wird jede eingehende (positive) Buchung mit dem Plan-Tag als "entnommen" gewertet und senkt nur den Saldo — der Plan re-aktiviert und verlangt erneut zu sparen, obwohl der Zweck (teil)erreicht ist. Es gibt keine Unterscheidung zwischen "Geld zurückgeholt, muss wieder eingezahlt werden" und "Geld für den Zweck verwendet, Ziel ist geschrumpft".

## Modell

Analog zu BAföG (`tag.bafoegschulden` vs `tag.bafoegschulden.entnahme`) wird der Sparplan-Tag `tag.X` durch den Suffix `.entnahme` ergänzt:

| Buchung (eingehend, amount > 0) | Verwendungszweck enthält | Bedeutung |
|---|---|---|
| **Verschuldung** | `tag.X` (ohne Suffix) | Geld zurückgeholt, NICHT für den Zweck → senkt Saldo, Ziel bleibt → muss zurückgezahlt werden |
| **Entnahme** | `tag.X.entnahme` | Geld für den Zweck verwendet → senkt Saldo UND effektives Ziel |

Trennung über Leerzeichen-Grenze: `(' ' || COALESCE(purpose,'') || ' ') LIKE '% tag.X %'` (Basis-Tag) vs `'% tag.X.entnahme %'` (Entnahme). Einzahlungen (amount < 0) zählen nur mit Basis-Tag.

## Formeln

```
saldo           = einzahlungen − verschuldung − entnahmen
effektives Ziel = max(0, Zielbetrag − entnahmen)
noch zu sparen  = max(0, Zielbetrag − einzahlungen + verschuldung)
is_completed    = Zielbetrag > 0 und saldo ≥ effektives Ziel
```

- `noch zu sparen` ist äquivalent zu `max(0, effektives Ziel − saldo)`; Entnahmen kürzen sich raus (Ziel und gespart sinken gleich).
- Über-Entnahme (gespart 800, entnommen 1000) → `saldo = −200` = Rückstand, `is_completed = false`, Rest = 200 zum Ausgleichen.
- Fertiger Plan bleibt nach `.entnahme` abgeschlossen (Ziel und gespart sinken gleich), statt wieder aktiv zu werden.

## Backend

### `db/savings.py`

Neue Funktionen, BAföG-Stil:

- `get_savings_breakdown(tag)` → `{einzahlungen, verschuldung, entnahmen, saldo}`
  - Einzahlungen: `amount < 0`, Basis-Tag
  - Verschuldung: `amount > 0`, Basis-Tag
  - Entnahmen: `amount > 0`, `tag.X.entnahme`
  - `saldo = einzahlungen − verschuldung − entnahmen`
- `get_savings_month_breakdown(tag, month)` → gleiches Shape, auf Monat gefiltert

Bestehende `get_saved_breakdown`/`get_month_breakdown` (Eimer Notgroschen/Invest) bleiben unverändert.

### `allocation_service.py` `_enrich_savings_plan`

- Nutzt neue Breakdown-Funktionen.
- Neue Felder: `effective_target`, `saved_verschuldung`, `month_verschuldung`.
- Neue `remaining`-Logik für `required_monthly_rate`.
- `is_completed` auf `saldo ≥ effective_target`.

### `transfer_savings_plan` Guard

- Betrag gegen `max(0, effective_target − saldo)` prüfen statt `target − saved_amount`.

### Tests

`test_allocation_service.py`:

- `TestEnrichSavingsPlan` auf neue Funktion/Shape umstellen.
- Neue Tests: Entnahme (Ziel 700, gespart 500, Rest 200), Verschuldung (Ziel bleibt, Rest 500), Über-Entnahme (saldo −200, `is_completed = false`), `.entnahme`-Suffix zählt nicht als Einzahlung.

## Frontend

### `lib/allocation.ts`

`SavingsPlan`-Typ: `effective_target`, `saved_verschuldung`, `month_verschuldung`.

### `savings-plans-card.tsx`

- Anzeige "X von **effektivem Ziel**"; `remainingToSave = max(0, effectiveTarget − saldo)`; Slider-Max entsprechend.
- Verschuldung als eigene Zeile/Segment ("X verschuldet (wird zurückgezahlt)"), Rückstand bei negativem saldo.
- `computeMonthlyRate`: `remaining = Betrag − entnahmen − gespart`.
- Hinweistext zum `.entnahme`-Suffix.

## Nicht im Scope

- Keine DB-Migration, kein neuer Endpoint, kein UI-Button — Entnahme/Verschuldung entstehen durch externe Überweisungen mit Tag im Verwendungszweck und werden passiv erkannt.
- Eimer (Notgroschen etc.) bleiben unverändert.
- Bestehende Buchungen werden automatisch neu interpretiert (positiv ohne Suffix → jetzt Verschuldung).
