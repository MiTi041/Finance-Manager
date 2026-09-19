import { ArrowUpRight, Clock, Eye, EyeOff } from "lucide-react";
import { BankLogo } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
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
  return (
    <section>
      <SectionHeading>Konten</SectionHeading>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {accountBalances.map((acc) => (
          <div
            key={acc.accountIban}
            className={`flex flex-col gap-3 rounded-panel border border-border bg-card p-4 ${
              acc.excludeFromTotals ? "opacity-70" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <BankLogo
                  src={acc.bankLogo || undefined}
                  srcDark={acc.bankLogoDark || undefined}
                  alt={acc.accountName || acc.bankName || "Bank"}
                  sizeClassName="size-10 shrink-0 p-1 rounded border-0 bg-muted"
                  kind="company"
                />
                <div className="flex min-w-0 flex-col items-start">
                  <span className="max-w-full truncate font-mono text-xs text-foreground tabular-nums">
                    {acc.accountName}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-mono text-xs tabular-nums ${acc.balance >= 0 ? "text-emerald-500" : "text-red-500"}`}
                    >
                      {euroFormatter.format(acc.balance)}
                    </span>
                    {acc.balancePending ? (
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                        {euroFormatter.format(acc.balance + acc.balancePending)}
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
              <button
                type="button"
                onClick={() => onToggleExclude?.(acc.scope, acc.accountIban, !acc.excludeFromTotals)}
                aria-pressed={acc.excludeFromTotals}
                title={
                  acc.excludeFromTotals
                    ? "In Summen und Charts einbeziehen"
                    : "Aus Summen und Charts ausblenden"
                }
                className="shrink-0 cursor-pointer rounded-control p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {acc.excludeFromTotals ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {transferableIbans?.has(acc.accountIban) && (
              <Button
                size="sm"
                className="mt-auto w-full gap-1"
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
