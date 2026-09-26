import { BrandIcon } from "@/components/bank-logo";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getServerBaseUrl, logoBackgroundClass } from "@/lib/bank/zahlungspartner-logo";
import { formatAmount, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Clock, Inbox } from "lucide-react";

import type { MonthSubscriptionContribution } from "./subscription-monthly-chart";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullLabel: string;
  contributions: MonthSubscriptionContribution[];
  total: number;
  totalIncome: number;
};

export function SubscriptionMonthBreakdownDialog({
  open,
  onOpenChange,
  fullLabel,
  contributions,
  total,
  totalIncome,
}: Props) {
  const hasProjected = contributions.some((c) => c.projectedAmount > 0);

  // Größte Posten zuerst – die relevantesten Infos oben
  const sorted = [...contributions].sort(
    (a, b) => b.paidAmount + b.projectedAmount - (a.paidAmount + a.projectedAmount),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Abos · {fullLabel}
            {contributions.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({contributions.length})
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Diese Abonnements fließen in die Berechnung des Monats ein.
          </DialogDescription>
        </DialogHeader>

        {contributions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Keine Buchungen in diesem Monat.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="scroll-fade no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 pb-1">
              {sorted.map((c) => {
                const sub = c.subscription;
                const name = sub.datenbankName || sub.name || "-";
                const rawLogo = sub.recipientLogo;
                const logoUrl = rawLogo?.startsWith("/")
                  ? `${getServerBaseUrl()}${rawLogo}`
                  : rawLogo || undefined;
                const amount = c.paidAmount + c.projectedAmount;
                return (
                  <div
                    key={`${sub._counterpartyName || sub.name}|${sub.amount}`}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <BrandIcon
                        src={logoUrl}
                        alt={sub.name}
                        sizeClassName="size-10 shrink-0"
                        backgroundClassName={logoBackgroundClass(sub.logoBackground)}
                        kind={sub.isCompany === false ? "person" : "company"}
                        imgNoPadding={!sub.logoPadding}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-tight">{name}</p>
                        <div className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
                          <span>{sub.frequencyLabel}</span>
                          {c.projectedAmount > 0 && (
                            <Badge
                              variant="outline"
                              className="h-4 gap-0.5 border-orange-400/40 px-1 text-[10px] text-orange-500"
                            >
                              <Clock className="size-2.5" />
                              geplant
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "font-mono text-sm font-semibold tabular-nums",
                          sub.direction === "income" ? "text-green-600" : "text-destructive",
                        )}
                      >
                        {formatAmount(amount)}
                      </p>
                      {c.projectedAmount > 0 && (
                        <p className="text-[11px] tabular-nums text-orange-500/80">
                          davon <span className="font-mono">{formatAmount(c.projectedAmount)}</span>
                          {c.projectedDate ? ` · ${formatDate(c.projectedDate)}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasProjected && (
              <p className="text-[11px] text-muted-foreground">
                * Geplante Buchungen sind noch nicht abgebucht und wurden geschätzt.
              </p>
            )}

            {/* Sticky Footer: bleibt sichtbar, auch wenn die Liste scrollt */}
            <div className="space-y-1 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Ausgaben gesamt
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-destructive">
                  {formatAmount(total)}
                </span>
              </div>
              {totalIncome > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Einnahmen gesamt
                  </span>
                  <span className="font-mono text-lg font-bold tabular-nums text-green-600">
                    {formatAmount(totalIncome)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
