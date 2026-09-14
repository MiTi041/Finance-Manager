import { ArrowUpRight, Clock } from "lucide-react";
import { BankLogo } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "./section-heading";

const euroFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export type AccountBalance = {
  bankLogo?: string;
  accountIban: string;
  accountName: string;
  bankName: string;
  balance: number;
  balancePending?: number;
};

type AccountCardsProps = {
  accountBalances: AccountBalance[];
  transferableIbans?: Set<string>;
  onAccountTransfer?: (iban: string) => void;
};

export function AccountCards({
  accountBalances,
  transferableIbans,
  onAccountTransfer,
}: AccountCardsProps) {
  return (
    <section>
      <SectionHeading>Konten</SectionHeading>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {accountBalances.map((acc) => (
          <div
            key={acc.accountIban}
            className="flex flex-col gap-3 rounded-panel border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <BankLogo
                src={acc.bankLogo || undefined}
                alt={acc.accountName || acc.bankName || "Bank"}
                sizeClassName="size-10 shrink-0 p-1 rounded border-0 bg-muted"
                kind="company"
              />
              <div className="flex min-w-0 flex-col items-start">
                <span className="truncate font-mono text-xs text-foreground tabular-nums">
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
