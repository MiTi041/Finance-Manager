import type { Budget, BudgetPeriod } from "@/lib/budgets";

export function categoryIdsForPeriod(
  budgets: Budget[],
  period: BudgetPeriod,
  excludeId?: number,
): Set<number> {
  return new Set(
    budgets
      .filter((b) => b.period === period && b.id !== excludeId)
      .flatMap((b) => b.category_ids),
  );
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}
