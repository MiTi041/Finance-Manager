import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount } from "@/lib/utils/format";
import { formatMonthLabel } from "@/pages/budgets/utils";
import { buildMonthlyOverview } from "@/lib/allocation-overview";
import type { AllocationStatus } from "@/lib/allocation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: AllocationStatus;
};

const SEGMENT_COLOR: Record<string, string> = {
  bafoeg: "bg-rose-500",
  donation: "bg-fuchsia-500",
  emergency: "bg-amber-500",
  invest: "bg-emerald-500",
  savings: "bg-sky-500",
  leftover: "bg-slate-400",
};

export function MonthlyOverviewDialog({ open, onOpenChange, status }: Props) {
  const rows = buildMonthlyOverview(status);
  const income = rows.find((r) => r.kind === "income");
  const segments = rows
    .filter((r) => r.kind !== "income")
    .sort((a, b) => {
      if (a.kind === "leftover") return 1;
      if (b.kind === "leftover") return -1;
      return b.amount - a.amount;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Monatsübersicht</DialogTitle>
          <DialogDescription>{formatMonthLabel(status.month)}</DialogDescription>
        </DialogHeader>

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">Einkommen</span>
          <span className="font-mono text-base font-bold tabular-nums">
            {formatAmount(income?.amount ?? 0)}
          </span>
        </div>

        <div className="flex h-2 w-full gap-1">
          {segments.map((row) => (
            <Tooltip key={row.key}>
              <TooltipTrigger asChild>
                <div
                  className={`h-full cursor-pointer rounded-full ${SEGMENT_COLOR[row.key] ?? "bg-muted-foreground"}`}
                  style={{ flex: `${Math.max(0, row.amount)} 1 0%`, minWidth: "6px" }}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                {row.label}: <span className="font-mono">{formatAmount(row.amount)}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="space-y-2.5">
          {segments.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${SEGMENT_COLOR[row.key] ?? "bg-muted-foreground"}`}
                />
                <span
                  className={
                    row.kind === "leftover"
                      ? "truncate text-sm font-semibold"
                      : "truncate text-sm text-muted-foreground"
                  }
                >
                  {row.label}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="text-xs text-muted-foreground/70">
                  {row.percent.toFixed(1)}%
                </span>
                <span
                  className={`font-mono ${row.kind === "leftover" ? "text-sm font-bold" : "text-sm font-medium"}`}
                >
                  {formatAmount(row.amount)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
