import { useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Budget } from "@/lib/budgets";
import { formatAmount } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";

type Tone = "over" | "reached" | "warn" | "ok";

// Alle Statusfarben an einer Stelle – Klassen bleiben als volle Strings stehen,
// damit Tailwind sie zuverlässig erkennt.
const TONES: Record<
  Tone,
  { label: string; bar: string; dot: string; badge: string; text: string }
> = {
  over: {
    label: "Überzogen",
    bar: "bg-red-500",
    dot: "bg-red-500",
    badge: "bg-red-500/10 text-red-700 dark:text-red-300",
    text: "text-red-600 dark:text-red-400",
  },
  reached: {
    label: "Erreicht",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    label: "Fast erreicht",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
  },
  ok: {
    label: "Im Plan",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
  },
};

function getTone(ratio: number): Tone {
  if (ratio > 1) return "over";
  if (ratio >= 1) return "reached";
  if (ratio >= 0.7) return "warn";
  return "ok";
}

const MAX_VISIBLE_CATEGORIES = 3;

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

  const ratio = budget.amount > 0 ? budget.spent / budget.amount : budget.spent > 0 ? 1 : 0;
  const percent = Math.round(ratio * 100);
  const tone = TONES[getTone(ratio)];
  const isOver = budget.remaining < 0;

  const visibleCategories = budget.categories.slice(0, MAX_VISIBLE_CATEGORIES);
  const hiddenCategories = budget.categories.slice(MAX_VISIBLE_CATEGORIES);
  const hasTags = budget.categories.length > 0 || budget.hashtags.length > 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        {/* Kopf: Name, Status, Menü */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="truncate text-base leading-tight font-semibold" title={budget.name}>
              {budget.name}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  tone.badge,
                )}
              >
                <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
                {tone.label}
              </span>
              {budget.period === "yearly" && (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Jahresbudget
                </span>
              )}
            </div>
          </div>

          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1 -mr-2 size-8 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
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

        {/* Betrag + Fortschritt */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
              {formatAmount(budget.spent)}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              von {formatAmount(budget.amount)}
            </span>
          </div>

          <Progress
            value={Math.min(ratio * 100, 100)}
            indicatorClassName={tone.bar}
            className="h-2 w-full"
            aria-label={`${percent} Prozent des Budgets „${budget.name}“ genutzt`}
          />

          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground tabular-nums">{percent}&nbsp;% genutzt</span>
            <span className={cn("font-semibold tabular-nums", tone.text)}>
              {isOver
                ? `${formatAmount(Math.abs(budget.remaining))} überzogen`
                : `${formatAmount(budget.remaining)} übrig`}
            </span>
          </div>
        </div>

        {/* Kategorien & Hashtags */}
        {hasTags && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t pt-4">
            {visibleCategories.map((c) => (
              <span
                key={c.name}
                className="inline-flex max-w-40 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
              >
                <span aria-hidden>{c.icon ?? "🏷️"}</span>
                <span className="truncate">{c.name}</span>
              </span>
            ))}
            {hiddenCategories.length > 0 && (
              <span
                className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                title={hiddenCategories.map((c) => c.name).join(", ")}
              >
                +{hiddenCategories.length}
              </span>
            )}
            {budget.hashtags.map((tag) => (
              <span
                key={tag}
                className="inline-flex max-w-40 items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                <span className="truncate">#{tag}</span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
