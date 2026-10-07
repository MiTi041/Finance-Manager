import { formatAmount, formatDate } from "@/lib/utils/format";
import type { LiquidityAutoItem } from "../utils";

export function AutoItems({ items }: { items: LiquidityAutoItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 border-b border-border/60 px-1 py-2 text-sm last:border-b-0"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate">{item.label}</span>
            <span className="text-xs text-muted-foreground">
              {item.source === "subscription" ? "Abo" : "Vorgemerkt"}
              {item.date ? ` · ${formatDate(item.date)}` : ""}
            </span>
          </div>
          <span
            className={`shrink-0 tabular-nums ${
              item.amount < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {formatAmount(item.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
