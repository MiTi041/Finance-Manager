# Implementierungsplan: Sparplan Entnahme & Verschuldung

Datum: 2026-08-02 · Spec: `docs/superpowers/specs/2026-08-02-savings-plan-entnahme-design.md`

## Task 1: `db/savings.py` — neue Breakdown-Funktionen

Neue Funktionen `get_savings_breakdown(tag)` und `get_savings_month_breakdown(tag, month)` im BAföG-Stil. Rückgabe `{einzahlungen, verschuldung, entnahmen, saldo}`. Matching über Leerzeichen-Grenze.

## Task 2: `allocation_service.py` — Enrich + Guard

- `_enrich_savings_plan` (Z. 562) auf neue Funktionen umstellen; `effective_target`, `saved_verschuldung`, `month_verschuldung`, neue `remaining`/`is_completed`.
- `transfer_savings_plan` (Z. 643): Guard `max(0, effective_target − saldo)`.

## Task 3: Tests

`TestEnrichSavingsPlan` umstellen + neue Fälle (Entnahme, Verschuldung, Über-Entnahme, Suffix-Trennung).

## Task 4: Frontend

- `lib/allocation.ts`: neue Typfelder.
- `savings-plans-card.tsx`: Anzeige effektives Ziel, `remainingToSave`, Verschuldungs-Zeile/Segment, `computeMonthlyRate`, Hinweistext.

## Task 5: Verifikation

- `cd backend && python -m pytest tests/test_allocation_service.py -q`
- Frontend `pnpm --filter frontend lint`/typecheck (Kommandos aus package.json prüfen).
