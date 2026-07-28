import { useEffect, useState } from "react";
import { Loader2, Ellipsis, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BankLogo } from "@/components/bank-logo";
import { formatAmount } from "@/lib/utils/format";
import {
  fetchDonationAnalytics,
  type DonationAnalytics,
} from "@/lib/allocation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DonationAnalysisDialog({ open, onOpenChange }: Props) {
  const [data, setData] = useState<DonationAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchDonationAnalytics()
      .then(setData)
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Spenden-Analyse</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Keine Daten verfügbar.
          </p>
        ) : (
          <div className="space-y-3">
            {data.accounts.length === 0 && !data.others ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Bisher keine Spenden-Transaktionen gefunden.
              </p>
            ) : (
              <>
                <div className="space-y-2.5">
                  {data.accounts.map((acc) => {
                    const pct =
                      data.total > 0
                        ? (acc.total / data.total) * 100
                        : 0;
                    return (
                      <div key={acc.iban} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2.5">
                          <BankLogo
                            src={acc.logo_url ?? undefined}
                            alt={acc.account_name}
                            sizeClassName="size-8 shrink-0"
                            backgroundClassName={
                              acc.logo_white_background
                                ? "bg-white"
                                : "bg-muted"
                            }
                            imgNoPadding={!acc.logo_padding}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-tight">
                              {acc.account_name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground leading-tight">
                              {acc.count}{" "}
                              {acc.count === 1 ? "Spende" : "Spenden"}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatAmount(acc.total)}
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-pink-500/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {data.others && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                          <Ellipsis className="size-4 text-muted-foreground/50" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-tight">
                            Andere
                          </p>
                          <p className="truncate text-xs text-muted-foreground leading-tight">
                            {data.others.count}{" "}
                            {data.others.count === 1
                              ? "Spende"
                              : "Spenden"}{" "}
                            (nicht zuordenbar)
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatAmount(data.others.total)}
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-muted-foreground/30"
                          style={{
                            width: `${
                              data.total > 0
                                ? (data.others.total / data.total) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground/50">
                    Gesamt
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {formatAmount(data.total)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}