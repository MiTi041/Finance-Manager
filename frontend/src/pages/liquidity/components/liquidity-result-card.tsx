import { Card, CardContent } from "@/components/ui/card";
import { formatAmount } from "@/lib/utils/format";
import type { LiquidityResult } from "../utils";

const STATUS: Record<LiquidityResult["status"], { label: string; className: string }> = {
  covered: { label: "Garantiert gedeckt", className: "text-emerald-600 dark:text-emerald-400" },
  best_case: {
    label: "Nur im Best Case gedeckt",
    className: "text-amber-600 dark:text-amber-400",
  },
  shortfall: { label: "Nicht gedeckt", className: "text-destructive" },
};

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatAmount(value)}</span>
    </div>
  );
}

export function LiquidityResultCard({ result }: { result: LiquidityResult }) {
  const status = STATUS[result.status];
  return (
    <Card className="border-none bg-muted/40 shadow-none">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <span className={`text-sm font-medium ${status.className}`}>{status.label}</span>
          <span className={`text-3xl font-semibold tabular-nums ${status.className}`}>
            {formatAmount(result.discrepancy)}
          </span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Row label="Sichere Einnahmen" value={result.certainIncome} />
          <Row label="Sichere Ausgaben" value={-result.certainExpense} />
          <Row
            label="Erwarteter Saldo"
            value={result.expectedIncome - result.expectedExpense}
          />
          <Row label="Saldo garantiert" value={result.certainBalance} />
          <Row label="Saldo Best Case" value={result.bestBalance} />
        </div>
      </CardContent>
    </Card>
  );
}
