import { formatAmount } from "@/lib/utils/format";
import type { LiquidityResult } from "../utils";

const STATUS: Record<LiquidityResult["status"], { label: string; text: string; dot: string }> = {
  covered: {
    label: "Gedeckt",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  shortfall: {
    label: "Nicht gedeckt",
    text: "text-destructive",
    dot: "bg-destructive",
  },
};

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{formatAmount(value)}</dd>
    </div>
  );
}

export function LiquidityResultCard({ result }: { result: LiquidityResult }) {
  const status = STATUS[result.status];
  return (
    <section aria-live="polite" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`size-2 rounded-full ${status.dot}`} aria-hidden />
          {status.label}
        </div>
        <p className={`text-5xl font-semibold tracking-tight tabular-nums ${status.text}`}>
          {formatAmount(result.discrepancy)}
        </p>
      </div>

      <dl className="grid gap-x-10 border-t border-border/60 pt-3 sm:grid-cols-2">
        <div>
          <Row label="Einnahmen" value={result.income} />
          <Row label="Ausgaben" value={-result.expense} />
        </div>
      </dl>
    </section>
  );
}
