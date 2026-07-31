# Budgets-Seite Modularisierung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Budgets-One-Pager (`frontend/src/pages/budgets/budgets-page.tsx`, 413 Zeilen) in die modulare Struktur des Allocation-Bereichs zerlegen: `components/`, `hooks/`, `utils.ts`. Reiner Refactor, keine sichtbaren Verhaltensänderungen.

**Architecture:** Eine Task, da der Refactor erst mit der letzten Datei kompiliert. Page wird zur Kompositions-Schale (Dialog-State + Toasts), `use-budgets.ts` übernimmt Datenfluss, Dialoge/Card werden eigenständige Komponenten, Monats-Helfer wandern nach `utils.ts`.

**Tech Stack:** React + Vite + Tailwind + shadcn/ui. Kein Backend, keine neuen Dependencies, kein Frontend-Test-Runner (Gates: `npx tsc --noEmit` + `pnpm build`).

## Global Constraints

- Scope: nur `frontend/src/pages/budgets/`. Keine anderen Dateien, kein Backend.
- Keine neuen Dependencies.
- Verhalten identisch; einzige Ergänzung: Refresh-Listener auf `finance-data-refresh` im Hook (Muster `useAllocation`).
- Export der Default-Komponente `BudgetsPage` bleibt bestehen (Route in `App.tsx` importiert sie).
- Commit-Message: `refactor(budgets): split budgets page into components/hooks/utils`.

---

### Task 1: Budgets-Seite in Module zerlegen

**Files:**
- Create: `frontend/src/pages/budgets/utils.ts`
- Create: `frontend/src/pages/budgets/hooks/use-budgets.ts`
- Create: `frontend/src/pages/budgets/components/budget-card.tsx`
- Create: `frontend/src/pages/budgets/components/add-budget-dialog.tsx`
- Create: `frontend/src/pages/budgets/components/edit-budget-dialog.tsx`
- Modify: `frontend/src/pages/budgets/budgets-page.tsx` (komplett ersetzen)

**Interfaces:**
- `utils.ts`: `currentMonth(): string`, `shiftMonth(month: string, delta: number): string`.
- `useBudgets()` → `{ month, setMonth, budgets, categories, loading, error, load, create, update, remove }`.
- `BudgetCard({ budget, onEdit, onDelete })`; `AddBudgetDialog({ open, onOpenChange, categories, existingCategoryIds, onCreate })`; `EditBudgetDialog({ open, budget, onOpenChange, onSave })` mit `onSave: (id, amount) => Promise<void>` (wirft bei Fehler; Dialog bleibt dann offen).
- Consumes: `@/lib/budgets` (`fetchBudgets`, `createBudget`, `updateBudget`, `deleteBudget`, `Budget`), `@/lib/categories/api` (`fetchCategories`), `@/lib/categories/types` (`FinanceCategory`), `@/lib/utils/format` (`formatAmount`), `@/lib/utils` (`cn`), UI-Komponenten wie bisher.

**Schritte:**

- [ ] **Step 1: Datei `utils.ts` erstellen**

```ts
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Datei `hooks/use-budgets.ts` erstellen**

```ts
import { useCallback, useEffect, useState } from "react";
import type { FinanceCategory } from "@/lib/categories/types";
import {
  fetchBudgets,
  createBudget as createBudgetApi,
  updateBudget as updateBudgetApi,
  deleteBudget as deleteBudgetApi,
  type Budget,
} from "@/lib/budgets";
import { fetchCategories } from "@/lib/categories/api";
import { currentMonth } from "../utils";

export function useBudgets() {
  const [month, setMonth] = useState(currentMonth);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgetRows, cats] = await Promise.all([fetchBudgets(month), fetchCategories()]);
      setBudgets(budgetRows);
      setCategories(cats.filter((c) => c.typ === "Ausgabe"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("finance-data-refresh", onRefresh);
    return () => window.removeEventListener("finance-data-refresh", onRefresh);
  }, [load]);

  const create = useCallback(
    async (categoryId: number, amount: number) => {
      await createBudgetApi(categoryId, amount);
      await load();
    },
    [load],
  );

  const update = useCallback(
    async (id: number, amount: number) => {
      await updateBudgetApi(id, amount);
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteBudgetApi(id);
      await load();
    },
    [load],
  );

  return { month, setMonth, budgets, categories, loading, error, load, create, update, remove };
}
```

- [ ] **Step 3: Datei `components/budget-card.tsx` erstellen**

```tsx
import { useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Budget } from "@/lib/budgets";
import { formatAmount } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";

export function BudgetCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: Budget;
  onEdit: (budget: Budget) => void;
  onDelete: (id: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ratio = budget.monthly_amount > 0 ? budget.spent / budget.monthly_amount : budget.spent > 0 ? 1 : 0;
  const color = ratio > 1 ? "bg-red-500" : ratio >= 0.7 ? "bg-amber-500" : "bg-emerald-500";
  const status =
    ratio > 1
      ? { label: "Überzogen", cls: "bg-red-500/10 text-red-600 dark:text-red-400" }
      : ratio >= 0.7
        ? { label: "Fast erreicht", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
        : { label: "Im Plan", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
              {budget.icon ?? "🏷️"}
            </span>
            <span className="truncate text-sm font-medium">{budget.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                status.cls,
              )}
            >
              {status.label}
            </span>
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
                  aria-label={`Optionen für ${budget.name}`}
                >
                  <MoreVertical className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1">
                <Button
                  variant="ghost"
                  className="w-full cursor-pointer justify-start gap-2 px-2 py-1.5 text-sm"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(budget);
                  }}
                >
                  <Pencil className="size-4" /> Bearbeiten
                </Button>
                <Button
                  variant="ghost"
                  className="w-full cursor-pointer justify-start gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(budget.id);
                  }}
                >
                  <Trash2 className="size-4" /> Löschen
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <p className="text-sm font-semibold tabular-nums">
          {formatAmount(budget.spent)} <span className="font-normal text-muted-foreground">/</span>{" "}
          {formatAmount(budget.monthly_amount)}
        </p>

        <div className="flex flex-col gap-1">
          <Progress value={ratio * 100} indicatorClassName={color} className="h-2.5 w-full" />
          <p className={cn("text-xs font-medium", color.replace("bg-", "text-"))}>
            {Math.round(ratio * 100)} % vom Budget genutzt
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Datei `components/add-budget-dialog.tsx` erstellen**

```tsx
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FinanceCategory } from "@/lib/categories/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function AddBudgetDialog({
  open,
  onOpenChange,
  categories,
  existingCategoryIds,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: FinanceCategory[];
  existingCategoryIds: Set<number>;
  onCreate: (categoryId: number, amount: number) => void;
}) {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const available = categories.filter((c) => !existingCategoryIds.has(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Budget hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {available.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                categoryId === c.id
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "hover:bg-muted",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                {c.icon ?? "🏷️"}
              </span>
              <span className="truncate">{c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}</span>
            </button>
          ))}
          {available.length === 0 && (
            <p className="text-sm text-muted-foreground">Alle Ausgabe-Kategorien haben bereits ein Budget.</p>
          )}
        </div>
        <div className="relative">
          <Input
            type="number"
            min={0}
            placeholder="Monatsbudget"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && categoryId != null && Number(amount) > 0) {
                void onCreate(categoryId, Number(amount));
                setCategoryId(null);
                setAmount("");
                onOpenChange(false);
              }
            }}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            €
          </span>
        </div>
        <DialogFooter>
          <Button
            disabled={categoryId == null || !(Number(amount) > 0)}
            onClick={() => {
              if (categoryId == null) return;
              void onCreate(categoryId, Number(amount));
              setCategoryId(null);
              setAmount("");
              onOpenChange(false);
            }}
          >
            Hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Datei `components/edit-budget-dialog.tsx` erstellen**

```tsx
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Budget } from "@/lib/budgets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function EditBudgetDialog({
  open,
  budget,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  budget: Budget | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && budget) setAmount(String(budget.monthly_amount));
  }, [open, budget]);

  const parsed = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed >= 0;

  const save = async () => {
    if (!budget || !valid) return;
    setSaving(true);
    try {
      await onSave(budget.id, parsed);
      onOpenChange(false);
    } catch {
      // Fehler wurde bereits im Page-Handler getoastet; Dialog bleibt offen
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Budget bearbeiten</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{budget?.name}</p>
        <div className="relative">
          <Input
            type="number"
            min={0}
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) void save();
            }}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            €
          </span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={() => void save()} disabled={saving || !valid}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Datei `budgets-page.tsx` komplett ersetzen**

```tsx
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, PiggyBank, Plus, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { Budget } from "@/lib/budgets";
import { formatAmount } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBudgets } from "./hooks/use-budgets";
import { BudgetCard } from "./components/budget-card";
import { AddBudgetDialog } from "./components/add-budget-dialog";
import { EditBudgetDialog } from "./components/edit-budget-dialog";
import { currentMonth, shiftMonth } from "./utils";

export default function BudgetsPage() {
  const { month, setMonth, budgets, categories, loading, error, create, update, remove } =
    useBudgets();
  const [addOpen, setAddOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  const totals = useMemo(
    () => ({
      budget: budgets.reduce((sum, b) => sum + b.monthly_amount, 0),
      spent: budgets.reduce((sum, b) => sum + b.spent, 0),
      remaining: budgets.reduce((sum, b) => sum + b.remaining, 0),
    }),
    [budgets],
  );

  const handleCreate = async (categoryId: number, amount: number) => {
    try {
      await create(categoryId, amount);
      toast.success("Budget angelegt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await remove(id);
      toast.success("Budget gelöscht");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    }
  };

  const handleSaveEdit = async (id: number, amount: number) => {
    try {
      await update(id, amount);
      toast.success("Budget aktualisiert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
      throw e;
    }
  };

  const statBlocks: { label: string; value: number; Icon: typeof Wallet }[] = [
    { label: "Budget", value: totals.budget, Icon: Wallet },
    { label: "Ausgegeben", value: totals.spent, Icon: Receipt },
    { label: "Übrig", value: totals.remaining, Icon: PiggyBank },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 py-6">
      <Card className="border-none bg-muted/40 shadow-none">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Vorheriger Monat">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-24 text-center font-medium tabular-nums">{month}</span>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Nächster Monat">
              <ChevronRight className="size-4" />
            </Button>
            {month !== currentMonth() && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMonth(currentMonth())}>
                Heute
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {statBlocks.map(({ label, value, Icon }, i) => (
              <div key={label} className={cn("flex items-center gap-2", i > 0 && "border-l border-border pl-4")}>
                <Icon className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold tabular-nums">{formatAmount(value)}</p>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
              <Plus /> Budget hinzufügen
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <EmptyState title="Budgets konnten nicht geladen werden" text={error} />
      ) : budgets.length === 0 ? (
        <EmptyState
          title="Keine Budgets"
          text="Lege ein Budget für eine Kategorie an, um deine monatlichen Ausgaben im Blick zu behalten."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {budgets.map((b) => (
            <BudgetCard key={b.id} budget={b} onEdit={setEditingBudget} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <AddBudgetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        categories={categories}
        existingCategoryIds={new Set(budgets.map((b) => b.category_id))}
        onCreate={handleCreate}
      />

      <EditBudgetDialog
        open={editingBudget != null}
        budget={editingBudget}
        onOpenChange={(open) => {
          if (!open) setEditingBudget(null);
        }}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
```

- [ ] **Step 7: Verifikation** — Lauf in `frontend/`:
  - `npx tsc --noEmit` → erwartet: Exit 0, keine Ausgabe.
  - `pnpm build` → erwartet: `✓ built in …s`, keine TS-Fehler.
  - `git status` → nur die 6 Budgets-Dateien geändert/neu.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/budgets/
git commit -m "refactor(budgets): split budgets page into components/hooks/utils"
```

**Hinweis:** Kein Frontend-Test-Runner vorhanden (verifiziert in `package.json`); Gates sind tsc + build. Manueller Smoke-Test im Browser optional — Playwright ist in dieser Umgebung defekt, die App läuft aber auf `localhost:8111` (Vite-Dev-Server, HMR zeigt Änderungen live).
