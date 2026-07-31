import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchBudgets, createBudget, updateBudget, deleteBudget, type Budget } from "@/lib/budgets";
import { fetchCategories } from "@/lib/categories/api";
import type { FinanceCategory } from "@/lib/categories/types";
import { formatAmount } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function BudgetRow({
  budget,
  onUpdate,
  onDelete,
}: {
  budget: Budget;
  onUpdate: (id: number, amount: number) => void;
  onDelete: (id: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ratio = budget.monthly_amount > 0 ? budget.spent / budget.monthly_amount : budget.spent > 0 ? 1 : 0;
  const color = ratio > 1 ? "bg-red-500" : ratio >= 0.7 ? "bg-amber-500" : "bg-emerald-500";

  const commit = () => {
    if (draft == null) return;
    const value = Number(draft.replace(",", "."));
    if (Number.isFinite(value) && value >= 0 && value !== budget.monthly_amount) {
      void onUpdate(budget.id, value);
    }
    setDraft(null);
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <span className="text-2xl">{budget.icon ?? "🏷️"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{budget.name}</p>
            <div className="flex shrink-0 items-center gap-1">
              <Input
                type="number"
                aria-label={`Budget für ${budget.name}`}
                value={draft ?? budget.monthly_amount}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                }}
                className="h-7 w-24 text-right text-sm tabular-nums"
              />
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onDelete(budget.id)} aria-label={`Budget für ${budget.name} löschen`}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          <Progress value={ratio * 100} indicatorClassName={color} className="mt-2" />
          <p className="mt-1 text-xs text-muted-foreground">
            {formatAmount(budget.spent)} ausgegeben ·{" "}
            <span className={budget.remaining < 0 ? "text-red-600 dark:text-red-400" : ""}>
              {formatAmount(budget.remaining)} übrig
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AddBudgetDialog({
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
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {available.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                categoryId === c.id ? "border-primary bg-primary/10" : "hover:bg-muted",
              )}
            >
              <span>{c.icon ?? "🏷️"}</span>
              <span className="truncate">{c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}</span>
            </button>
          ))}
          {available.length === 0 && (
            <p className="text-sm text-muted-foreground">Alle Ausgabe-Kategorien haben bereits ein Budget.</p>
          )}
        </div>
        <Input
          type="number"
          min={0}
          placeholder="Monatsbudget in €"
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
        />
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

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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
  }, [load]);

  const totals = useMemo(
    () => ({
      budget: budgets.reduce((sum, b) => sum + b.monthly_amount, 0),
      spent: budgets.reduce((sum, b) => sum + b.spent, 0),
      remaining: budgets.reduce((sum, b) => sum + b.remaining, 0),
    }),
    [budgets],
  );

  const handleCreate = useCallback(
    async (categoryId: number, amount: number) => {
      try {
        await createBudget(categoryId, amount);
        toast.success("Budget angelegt");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    },
    [load],
  );

  const handleUpdate = useCallback(
    async (id: number, amount: number) => {
      try {
        await updateBudget(id, amount);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    },
    [load],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteBudget(id);
        toast.success("Budget gelöscht");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    },
    [load],
  );

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
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm">
            <div>
              <p className="text-muted-foreground">Budget</p>
              <p className="font-semibold tabular-nums">{formatAmount(totals.budget)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Ausgegeben</p>
              <p className="font-semibold tabular-nums">{formatAmount(totals.spent)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Übrig</p>
              <p className="font-semibold tabular-nums">{formatAmount(totals.remaining)}</p>
            </div>
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
            <BudgetRow key={b.id} budget={b} onUpdate={handleUpdate} onDelete={handleDelete} />
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
    </div>
  );
}
