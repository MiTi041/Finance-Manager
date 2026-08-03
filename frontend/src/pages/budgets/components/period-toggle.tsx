import type { BudgetPeriod } from "@/lib/budgets";
import { cn } from "@/lib/utils";

const OPTIONS: { value: BudgetPeriod; label: string }[] = [
  { value: "monthly", label: "Monat" },
  { value: "yearly", label: "Jahr" },
];

export function PeriodToggle({
  value,
  onChange,
}: {
  value: BudgetPeriod;
  onChange: (period: BudgetPeriod) => void;
}) {
  return (
    <div className="flex rounded-md bg-muted p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 cursor-pointer rounded px-3 py-1 text-xs font-medium transition-colors",
            value === opt.value ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
