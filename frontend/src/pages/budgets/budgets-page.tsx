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
