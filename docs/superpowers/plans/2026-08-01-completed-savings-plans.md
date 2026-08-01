# Abgeschlossene Sparpläne Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sparpläne, deren Sparziel erreicht ist, als „Abgeschlossen" anzeigen, aus den Berechnungen ausschließen und den Zahl-Button ausblenden.

**Architecture:** Rein rechnerische Erkennung (`saved_amount >= target_amount`), kein DB-Feld. Backend enriched Payload bekommt `is_completed`; `savings_total` filtert diese Pläne heraus. Frontend zeigt einen grünen Badge statt des Zahl-Buttons.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript (frontend), pytest.

## Global Constraints

- Keine DB-Migration, kein manueller Schalter, kein Backend-Guard gegen Transfers.
- UI-Texte deutsch („Abgeschlossen").
- Frontend-Typen in `frontend/src/lib/allocation.ts`.

---

### Task 1: Backend — `is_completed` im Enrichment + Filter in `savings_total`

**Files:**
- Modify: `backend/finance_server/services/allocation_service.py:138,559-605,285`
- Test: `backend/tests/test_allocation_service.py`

**Interfaces:**
- Consumes: bestehende Felder `target_amount`, `saved_amount` im Plan-Payload von `_enrich_savings_plan`.
- Produces: Feld `is_completed: bool` im enriched Plan-Payload; `savings_total` zählt nur Pläne mit `not is_completed`.

- [ ] **Step 1: Schreib den fehlschlagenden Test**

Füge in `TestEnrichSavingsPlan` eine Methode hinzu und erweitere `_enrich` um einen `saved`-Parameter:

```python
    def _enrich(self, created_at: str, month: str, count: int, saved: float = 0.0) -> dict[str, Any]:
        service = AllocationService()
        with ExitStack() as stack:
            stack.enter_context(patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]))
            stack.enter_context(patch("finance_server.services.allocation_service.get_saved_breakdown", return_value={"saldo": saved}))
            stack.enter_context(patch("finance_server.services.allocation_service.get_month_breakdown", return_value={"saldo": 0.0}))
            stack.enter_context(patch("finance_server.services.allocation_service.count_income_events_until", return_value=count))
            return service._enrich_savings_plan(self._plan(created_at), month)

    def test_completed_when_target_reached(self):
        result = self._enrich("2026-07-05T10:00:00+00:00", "2026-08", count=1, saved=1000.0)
        assert result["is_completed"] is True
        assert result["required_monthly_rate"] == 0.0

    def test_not_completed_below_target(self):
        result = self._enrich("2026-07-05T10:00:00+00:00", "2026-08", count=1, saved=999.0)
        assert result["is_completed"] is False

    def test_never_completed_without_target(self):
        plan = self._plan("2026-07-05T10:00:00+00:00")
        plan["target_amount"] = None
        service = AllocationService()
        with ExitStack() as stack:
            stack.enter_context(patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]))
            stack.enter_context(patch("finance_server.services.allocation_service.get_saved_breakdown", return_value={"saldo": 1000.0}))
            stack.enter_context(patch("finance_server.services.allocation_service.get_month_breakdown", return_value={"saldo": 0.0}))
            result = service._enrich_savings_plan(plan, "2026-08")
        assert result["is_completed"] is False
```

Zusätzlich in `TestSavingsPlanBudget` einen Fall, dass abgeschlossene Pläne nicht in `savings_total` zählen:

```python
    def _enrich_completed(self, completed_ids):
        def fake_enrich(plan, month):
            enriched = {**plan, "monthly_rate": 100.0}
            enriched["is_completed"] = plan["id"] in completed_ids
            return enriched
        return fake_enrich

    def test_completed_plans_excluded_from_savings_total(self):
        plans = [
            {"id": 1, "name": "Aktiv", "tag": "a", "created_at": "2026-01-01", "is_visible": True, "auto_hidden": False},
            {"id": 2, "name": "Fertig", "tag": "b", "created_at": "2026-02-01", "is_visible": True, "auto_hidden": False},
        ]
        result, _, _ = self._run_with_enrich("2026-07", 2000.0, plans, self._enrich_completed({2}))
        assert result["savings_total"] == 100.0
```

Der `_run_with_enrich`-Helper ist eine Variante von `_run`, die den Enrich-Mock als Argument nimmt statt über `rates`:

```python
    def _run_with_enrich(self, month, net_income, plans, enrich_side_effect, buckets=None):
        service = AllocationService()
        run_data = {"id": 1, "month": month, "net_income": net_income, "total_allocated": 0.0, "status": "pending"}
        with (
            patch("finance_server.services.allocation_service.db.list_buckets", return_value=buckets or []),
            patch("finance_server.services.allocation_service.db.get_run_for_month", side_effect=[None, run_data]),
            patch("finance_server.services.allocation_service.db.create_run", return_value=1),
            patch("finance_server.services.allocation_service.db.create_run_bucket"),
            patch("finance_server.services.allocation_service.db.get_run_buckets", return_value=[]),
            patch("finance_server.services.allocation_service.get_setting", return_value="false"),
            patch("finance_server.services.allocation_service.list_plans", return_value=plans),
            patch("finance_server.services.allocation_service.update_plan"),
            patch("finance_server.services.allocation_service.AllocationService._enrich_savings_plan", side_effect=enrich_side_effect),
            patch("finance_server.services.allocation_service.AllocationService._detect_income", return_value=net_income),
            patch("finance_server.services.allocation_service.AllocationService._detect_income_breakdown",
                  return_value={"total": net_income, "sources": []}),
            patch("finance_server.services.allocation_service.get_income_payout_days", return_value=[28]),
        ):
            return service.get_or_create_run(month)
```

> Hinweis: `_run` funktioniert mit beliebigem `side_effect`-Callable — `_run_with_enrich` ruft `_run` intern nicht auf, sondern ist eine Kopie mit direkt übergebenem Enrich-Mock. Kein Refactor von `_run` nötig.

- [ ] **Step 2: Test laufen lassen und Fehlschlag verifizieren**

Run: `cd backend && python -m pytest tests/test_allocation_service.py -k "completed" -v`
Expected: FAIL — `KeyError: 'is_completed'`

- [ ] **Step 3: Backend-Implementierung**

In `_enrich_savings_plan` (Zeile ~590), im Return-Dict vor `**plan` ergänzen:

```python
        target_amount_f = target_amount if target_amount else 0.0
        return {
            "is_completed": target_amount_f > 0 and saved_amount >= target_amount_f,
            **plan,
            ...
```

Genauer: nach Zeile 590 (`"**plan"`) ist das vorhandene Dict. Ersetze:

```python
        return {
            **plan,
            "monthly_rate": required_rate if required_rate is not None else 0.0,
```

durch:

```python
        return {
            "is_completed": target_amount_f > 0 and saved_amount >= target_amount_f,
            **plan,
            "monthly_rate": required_rate if required_rate is not None else 0.0,
```

In `get_or_create_run` (Zeile 138) — enrich nur einmal ausführen und abgeschlossene Pläne rausfiltern:

```python
        enriched_plans = [self._enrich_savings_plan(p, month) for p in all_plans]
        savings_total = sum(p["monthly_rate"] for p in enriched_plans if not p["is_completed"])
```

In `_build_run_response` (Zeile 285):

```python
        savings_total = sum(
            p["monthly_rate"] for p in savings_plans if p["is_visible"] and not p["is_completed"]
        )
```

- [ ] **Step 4: Test laufen lassen und Pass verifizieren**

Run: `cd backend && python -m pytest tests/test_allocation_service.py -k "completed" -v`
Expected: PASS (5 Tests)

Run: `cd backend && python -m pytest tests/test_allocation_service.py -v`
Expected: PASS (alle bestehenden + neue Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/services/allocation_service.py backend/tests/test_allocation_service.py
git commit -m "feat(savings): exclude completed savings plans from calculations"
```

### Task 2: Frontend — `is_completed` Typ + „Abgeschlossen"-Badge statt Zahl-Button

**Files:**
- Modify: `frontend/src/lib/allocation.ts:43-69`
- Modify: `frontend/src/pages/allocation/components/savings-plans-card.tsx:766,992-1031`

**Interfaces:**
- Consumes: Feld `is_completed: boolean` vom Backend (Task 1).
- Produces: keine — reine Darstellung.

- [ ] **Step 1: Typ erweitern**

In `frontend/src/lib/allocation.ts` beim `SavingsPlan`-Typ (nach `auto_hidden`):

```typescript
  auto_hidden: boolean;
  is_completed: boolean;
```

- [ ] **Step 2: Karten-Rendering anpassen**

In `savings-plans-card.tsx` nach Zeile 766 (`const planPaid = ...`) ergänzen:

```typescript
            const isCompleted = plan.is_completed;
```

Den Pay-Bereich (Zeile ~992) so ändern, dass bei abgeschlossenen Plänen der Badge erscheint. Ersetze den Anfang des Blocks:

```typescript
                <div className="mt-auto space-y-3">
                  {planPaid ? (
```

durch:

```typescript
                <div className="mt-auto space-y-3">
                  {isCompleted ? (
                    <div className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" /> Abgeschlossen
                    </div>
                  ) : planPaid ? (
```

> `CheckCircle2` und `formatAmount` sind bereits importiert (siehe Zeilen 993-995, gleiche JSX-Struktur wie „Monatsziel erreicht").

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: keine Fehler

Run: `cd frontend && npm run build`
Expected: build erfolgreich

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/allocation.ts frontend/src/pages/allocation/components/savings-plans-card.tsx
git commit -m "feat(savings): show completed badge and hide pay button for completed plans"
```

---

## Selbst-Review

- **Spec-Coverage:** `is_completed`-Erkennung (Task 1, Test `test_completed_when_target_reached`), Ausschluss aus `savings_total` (Task 1, `test_completed_plans_excluded_from_savings_total`), Badge statt Zahl-Button (Task 2), Menü bleibt unverändert (kein Touch im Task 2 außer Pay-Bereich). ✓
- **Platzhalter:** keine.
- **Typ-Konsistenz:** `is_completed` heißt überall gleich (Backend-Snake-Case, Frontend-Typ-Feld); `CheckCircle2` ist in der Datei bereits importiert.
