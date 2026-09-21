import { ArrowUpRight, Clock, Eye, EyeOff } from "lucide-react";
import { BankLogo } from "@/components/bank-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SectionHeading } from "./section-heading";

const euroFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export type AccountBalance = {
  bankLogo?: string;
  bankLogoDark?: string;
  accountIban: string;
  accountName: string;
  bankName: string;
  scope: string;
  excludeFromTotals?: boolean;
  isPrimary?: boolean;
  balance: number;
  balancePending?: number;
};

type AccountCardsProps = {
  accountBalances: AccountBalance[];
  transferableIbans?: Set<string>;
  onAccountTransfer?: (iban: string) => void;
  onToggleExclude?: (scope: string, iban: string, next: boolean) => void;
};

export function AccountCards({
  accountBalances,
  transferableIbans,
  onAccountTransfer,
  onToggleExclude,
}: AccountCardsProps) {
  const available = (acc: AccountBalance) => acc.balance + (acc.balancePending ?? 0);
  const isTransferable = (acc: AccountBalance) =>
    transferableIbans?.has(acc.accountIban) === true;
  const canTransfer = (acc: AccountBalance) =>
    isTransferable(acc) && acc.balance > 0;
  const transferRank = (acc: AccountBalance) =>
    canTransfer(acc) ? 2 : isTransferable(acc) ? 1 : 0;
  const sortedBalances = [...accountBalances].sort(
    (a, b) =>
      Number(b.isPrimary === true) - Number(a.isPrimary === true) ||
      transferRank(b) - transferRank(a),
  );
  return (
    <section>
      <SectionHeading>Konten</SectionHeading>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedBalances.map((acc) => (
          <div
            key={acc.accountIban}
            className="flex flex-col gap-3 rounded-panel border border-border bg-card p-4"
          >
            <div
              className={`flex items-start justify-between gap-2 ${
                acc.excludeFromTotals ? "opacity-70" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <BankLogo
                  src={acc.bankLogo || undefined}
                  srcDark={acc.bankLogoDark || undefined}
                  alt={acc.accountName || acc.bankName || "Bank"}
                  sizeClassName="size-10 shrink-0 p-1 rounded border-0 bg-muted"
                  kind="company"
                />
                <div className="flex min-w-0 flex-col items-start">
                  <div className="flex min-w-0 max-w-full items-center gap-1.5">
                    <span className="max-w-full truncate font-mono text-xs text-foreground tabular-nums">
                      {acc.accountName}
                    </span>
                    {acc.isPrimary ? (
                      <Badge
                        variant="secondary"
                        className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
                      >
                        Hauptkonto
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-mono text-xs tabular-nums ${available(acc) >= 0 ? "text-emerald-500" : "text-red-500"}`}
                    >
                      {euroFormatter.format(available(acc))}
                    </span>
                    {acc.balancePending ? (
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                        {euroFormatter.format(acc.balance)}
                      </span>
                    ) : null}
                  </div>
                  {acc.balancePending ? (
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      <Clock className="mr-1 inline size-3" />
                      Vorgemerkt: {euroFormatter.format(acc.balancePending)}
                    </span>
                  ) : null}
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onToggleExclude?.(acc.scope, acc.accountIban, !acc.excludeFromTotals)}
                    aria-pressed={acc.excludeFromTotals}
                    className="shrink-0 cursor-pointer rounded-control p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {acc.excludeFromTotals ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {acc.excludeFromTotals
                    ? "In Summen und Charts einbeziehen"
                    : "Aus Summen und Charts ausblenden"}
                </TooltipContent>
              </Tooltip>
            </div>
            {isTransferable(acc) && (
              <Button
                size="sm"
                className="mt-auto w-full gap-1"
                disabled={!canTransfer(acc)}
                onClick={() => onAccountTransfer?.(acc.accountIban)}
              >
                <ArrowUpRight className="size-3.5" />
                Überweisen
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
