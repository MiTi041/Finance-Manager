import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatAmount, formatDate } from "@/lib/utils/format";
import type { IncomeSource } from "@/lib/allocation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: IncomeSource[];
  isManual?: boolean;
};

export function IncomeBreakdownDialog({ open, onOpenChange, sources, isManual }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Netto-Berechnung</DialogTitle>
        </DialogHeader>

        {isManual ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Das Netto-Einkommen wurde manuell festgelegt. Die unten erkannten Einnahmen werden nicht
            verwendet.
          </p>
        ) : null}

        {sources.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Keine wiederkehrenden Einnahmen erkannt.
          </p>
        ) : (
          <div className="min-w-0 space-y-4">
            <p className="text-xs text-muted-foreground">
              Netto setzt sich aus diesen regelmäßigen Einnahmen zusammen
              (3+ Zahlungen im ~30-Tage-Rhythmus):
            </p>
            <div className="space-y-3">
              {sources.map((source, idx) => (
                <div
                  key={idx}
                  className="max-w-full min-w-0 rounded-lg border bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">
                        {source.name}
                      </p>
                      {source.purpose && (
                        <p className="truncate text-xs text-muted-foreground leading-tight">
                          {source.purpose}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatAmount(source.amount)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
                    {source.transactions.map((tx, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                      >
                        <span className="truncate">{formatDate(tx.date)}</span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {formatAmount(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground/50">
                Netto gesamt
              </span>
              <span className="font-mono text-lg font-bold tabular-nums">
                {formatAmount(sources.reduce((sum, s) => sum + s.amount, 0))}
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
