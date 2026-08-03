import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Budget, BudgetPeriod } from "@/lib/budgets";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBudgets } from "./hooks/use-budgets";
import { BudgetCard } from "./components/budget-card";
import { AddBudgetDialog } from "./components/add-budget-dialog";
import { EditBudgetDialog } from "./components/edit-budget-dialog";
import { categoryIdsForPeriod, currentMonth, formatMonthLabel, shiftMonth } from "./utils";

export default function BudgetsPage() {
  const { month, setMonth, budgets, categories, loading, error, create, update, remove } =
    useBudgets();
  const [addOpen, setAddOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  const existingByPeriod: Record<BudgetPeriod, Set<number>> = {
    monthly: categoryIdsForPeriod(budgets, "monthly"),
    yearly: categoryIdsForPeriod(budgets, "yearly"),
  };

  const existingForEdit: Record<BudgetPeriod, Set<number>> = {
    monthly: categoryIdsForPeriod(budgets, "monthly", editingBudget?.id),
    yearly: categoryIdsForPeriod(budgets, "yearly", editingBudget?.id),
  };

  const handleCreate = async (
    name: string,
    categoryIds: number[],
    amount: number,
    period: BudgetPeriod,
  ) => {
    try {
      await create(name, categoryIds, amount, period);
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

  const handleSaveEdit = async (
    id: number,
    name: string,
    categoryIds: number[],
    amount: number,
    period: BudgetPeriod,
  ) => {
    try {
      await update(id, name, categoryIds, amount, period);
      toast.success("Budget aktualisiert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
      throw e;
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 py-6">
      <Card className="border-none bg-muted/40 shadow-none">
        <CardContent className="flex flex-row justify-between gap-4 p-4 items-center sm:gap-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-28 text-center font-medium tabular-nums">
              {formatMonthLabel(month)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Nächster Monat"
              disabled={month === currentMonth()}
            >
              <ChevronRight className="size-4" />
            </Button>
            {month !== currentMonth() && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setMonth(currentMonth())}
              >
                Heute
              </Button>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setAddOpen(true)}
            >
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
          text="Lege ein Budget für eine Kategorie an, um deine monatlichen oder jährlichen Ausgaben im Blick zu behalten."
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
        existingCategoryIds={existingByPeriod}
        onCreate={handleCreate}
      />

      <EditBudgetDialog
        open={editingBudget != null}
        budget={editingBudget}
        categories={categories}
        existingCategoryIds={existingForEdit}
        onOpenChange={(open) => {
          if (!open) setEditingBudget(null);
        }}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
