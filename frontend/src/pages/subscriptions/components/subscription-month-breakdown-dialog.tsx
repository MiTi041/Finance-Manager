import { BrandIcon } from "@/components/bank-logo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getServerBaseUrl } from "@/lib/bank/zahlungspartner-logo";
import { formatAmount, formatDate } from "@/lib/utils/format";

import type { MonthSubscriptionContribution } from "./subscription-monthly-chart";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullLabel: string;
  contributions: MonthSubscriptionContribution[];
  total: number;
};

export function SubscriptionMonthBreakdownDialog({
  open,
  onOpenChange,
  fullLabel,
  contributions,
  total,
}: Props) {
  const hasProjected = contributions.some((c) => c.projectedAmount > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ausgaben · {fullLabel}</DialogTitle>
        </DialogHeader>

        {contributions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Keine Ausgaben in diesem Monat.
          </p>
        ) : (
          <div className="min-w-0 space-y-4">
            <p className="text-xs text-muted-foreground">
              Diese Abonnements fließen in die Berechnung des Monats ein:
            </p>
            <div className="max-h-[55vh] min-w-0 space-y-2 overflow-y-auto pr-1">
              {contributions.map((c) => {
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
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <BrandIcon
                        src={logoUrl}
                        alt={sub.name}
                        sizeClassName="size-8 shrink-0"
                        backgroundClassName={sub.logoWhiteBackground ? "bg-white" : "bg-zinc-900"}
                        kind={sub.isCompany === false ? "person" : "company"}
                        imgNoPadding={!sub.logoPadding}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-tight">{name}</p>
                        <p className="text-[11px] leading-tight text-muted-foreground">
                          {sub.frequencyLabel}
                          {c.projectedAmount > 0 ? " · geplant" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatAmount(amount)}</p>
                      {c.projectedAmount > 0 && (
                        <p className="text-[11px] tabular-nums text-orange-400/90">
                          davon {formatAmount(c.projectedAmount)} geplant
                          {c.projectedDate ? ` (${formatDate(c.projectedDate)})` : ""}
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
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground/50">
                Ausgaben gesamt
              </span>
              <span className="text-lg font-bold tabular-nums">{formatAmount(total)}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
