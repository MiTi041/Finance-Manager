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
  const ratio =
    budget.monthly_amount > 0 ? budget.spent / budget.monthly_amount : budget.spent > 0 ? 1 : 0;
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
        <div className="flex items-start justify-between gap-4">
          <span className="min-w-0 mt-[10px] truncate text-sm font-medium" title={budget.name}>
            {budget.name}
          </span>
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

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 mb-2">
          {budget.categories.slice(0, 3).map((c) => (
            <span
              key={c.name}
              className="inline-flex max-w-40 items-center gap-2 rounded-full bg-muted px-2 py-1 text-xs font-medium"
            >
              <span>{c.icon ?? "🏷️"}</span>
              <span className="truncate">{c.name}</span>
            </span>
          ))}
          {budget.categories.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              +{budget.categories.length - 3}
            </span>
          )}
        </div>

        <p className="text-sm font-semibold tabular-nums">
          {formatAmount(budget.spent)} <span className="font-normal text-muted-foreground">/</span>{" "}
          {formatAmount(budget.monthly_amount)}
        </p>

        <div className="flex flex-col gap-1">
          <Progress value={ratio * 100} indicatorClassName={color} className="h-2.5 w-full" />
          <p className={"text-xs font-medium text-muted-foreground"}>
            {Math.round(ratio * 100)} % vom Budget genutzt
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
