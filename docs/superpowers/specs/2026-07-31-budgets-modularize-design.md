# Budgets-Seite: Modulare Struktur wie Allocation

Datum: 2026-07-31
Status: Approved

## Ziel

Budgets-Seite von einem One-Pager (`budgets-page.tsx`, 413 Zeilen) in die modulare Struktur des Allocation-Bereichs überführen: `components/`, `hooks/`, `utils.ts`. Reiner Refactor — keine sichtbaren Verhaltensänderungen.

## Dateistruktur

```
frontend/src/pages/budgets/
  budgets-page.tsx              Schale: Header-Karte, Grid, Dialog-Verdrahtung, Toasts
  hooks/
    use-budgets.ts              Datenfluss + Mutationen + Refresh-Listener
  components/
    budget-card.tsx             Karte (Icon, Name, Status-Pill, ⋮-Dropdown)
    add-budget-dialog.tsx       Add-Dialog (unverändert übernommen)
    edit-budget-dialog.tsx      Bearbeiten-Dialog (self-contained)
  utils.ts                      currentMonth(), shiftMonth()
```

## Schnittstellen

### `utils.ts`
- `currentMonth(): string` — aktueller Monat als `YYYY-MM`.
- `shiftMonth(month: string, delta: number): string`.

### `hooks/use-budgets.ts`
- `useBudgets()` → `{ month, setMonth, budgets, categories, loading, error, load, create, update, remove }`
- `month` (State, init `currentMonth()`), `setMonth` für Navigation.
- `budgets: Budget[]`, `categories: FinanceCategory[]` (nur `typ === "Ausgabe"`), `loading`, `error`.
- `load()`: `Promise.all([fetchBudgets(month), fetchCategories()])`.
- Refresh-Listener auf `finance-data-refresh` (Muster `useAllocation`).
- `create(categoryId, amount): Promise<void>`, `update(id, amount): Promise<void>`, `remove(id): Promise<void>` — API-Call + `load()`.
- Lib-Funktionen aus `@/lib/budgets` mit Alias importieren (`createBudget as createBudgetApi`, …), um Namenskollision mit den Hook-Methoden zu vermeiden.

### `components/budget-card.tsx`
- `BudgetCard({ budget, onEdit, onDelete })` — identisch zum bisherigen `BudgetRow` (Status-Pill, Popover mit Bearbeiten/Löschen, Betrag-Zeile, Balken, Prozent-Zeile).

### `components/add-budget-dialog.tsx`
- `AddBudgetDialog({ open, onOpenChange, categories, existingCategoryIds, onCreate })` — unverändert übernommen.

### `components/edit-budget-dialog.tsx`
- `EditBudgetDialog({ open, budget, onOpenChange, onSave })` mit `budget: Budget | null`, `onSave: (id: number, amount: number) => Promise<void>`.
- Self-contained: eigener `amount`-State (Reset via `useEffect` bei `open && budget`), eigenes `saving`, eigene Validierung (`>= 0`), `autoFocus`, Enter speichert.
- `save()`: `await onSave(id, parsed)` → `onOpenChange(false)`. Während `saving` schließt der Dialog nicht (`onOpenChange`-Guard).

### `budgets-page.tsx` (Schale)
- Nutzt `useBudgets()`; hält nur `addOpen` und `editingBudget: Budget | null`.
- Handler mit Toasts: `handleCreate` („Budget angelegt"), `handleDelete` („Budget gelöscht"), `handleSaveEdit` („Budget aktualisiert").
- `totals`-useMemo und Header-Karte wie bisher; Grid rendert `BudgetCard`; `EditBudgetDialog` immer gemountet mit `open={editingBudget != null}`.

## Verhalten

- Identisch zum bisherigen Stand, einzige Ergänzung: Seite hört auf `finance-data-refresh` (konsistent mit Allocation; reloadt bei Datenänderungen automatisch, Badge-Logik unberührt).
