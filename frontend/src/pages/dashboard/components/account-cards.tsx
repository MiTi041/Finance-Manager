import { ArrowUpRight, Clock, Eye, EyeOff } from "lucide-react";
import { BankLogo } from "@/components/bank-logo";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatIban } from "@/lib/iban";
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
  const isTransferable = (acc: AccountBalance) => transferableIbans?.has(acc.accountIban) === true;
  const canTransfer = (acc: AccountBalance) => isTransferable(acc) && acc.balance > 0;
  const transferRank = (acc: AccountBalance) =>
    canTransfer(acc) ? 2 : isTransferable(acc) ? 1 : 0;
  const sortedBalances = [...accountBalances].sort(
    (a, b) =>
      Number(b.isPrimary === true) - Number(a.isPrimary === true) ||
      transferRank(b) - transferRank(a),
  );

  if (sortedBalances.length === 0) {
    return (
      <section>
        <SectionHeading>Konten</SectionHeading>
        <div className="flex flex-col items-center justify-center gap-1 rounded-panel border border-dashed border-border py-10 text-center">
          <p className="text-sm font-medium text-foreground">Keine Konten verbunden</p>
          <p className="text-xs text-muted-foreground">
            Verbinde ein Konto, um Salden hier zu sehen.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeading>Konten</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedBalances.map((acc) => {
          const excluded = acc.excludeFromTotals === true;
          const transferable = isTransferable(acc);
          const transferEnabled = canTransfer(acc);

          return (
            <article
              key={acc.accountIban}
              aria-label={`${acc.accountName || acc.bankName}, ${euroFormatter.format(available(acc))}${excluded ? ", von Summen ausgeschlossen" : ""}`}
              className={`group flex flex-col gap-3 rounded-panel border bg-card p-4 transition-colors duration-150 ${
                excluded
                  ? "border-dashed border-border/70"
                  : "border-border hover:border-foreground/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <BankLogo
                    src={acc.bankLogo || undefined}
                    srcDark={acc.bankLogoDark || undefined}
                    alt={acc.accountName || acc.bankName || "Bank"}
                    sizeClassName="size-10 shrink-0 p-1 rounded border-0 bg-muted"
                    kind="company"
                  />
                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                    <div className="flex min-w-0 max-w-full items-center gap-1.5">
                      <span className="max-w-full truncate text-sm font-medium text-foreground">
                        {acc.accountName || acc.bankName}
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
                    <div className="flex min-w-0 max-w-full items-center gap-1.5">
                      <span className="max-w-full truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                        {formatIban(acc.accountIban)}
                      </span>
                      <CopyButton value={acc.accountIban} label="IBAN kopieren" />
                    </div>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onToggleExclude?.(acc.scope, acc.accountIban, !excluded)}
                      aria-pressed={excluded}
                      aria-label={
                        excluded
                          ? "In Summen und Charts einbeziehen"
                          : "Aus Summen und Charts ausblenden"
                      }
                      className="shrink-0 cursor-pointer rounded-control p-1.5 text-muted-foreground opacity-0 transition-colors focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground aria-pressed:opacity-100"
                    >
                      {excluded ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {excluded
                      ? "In Summen und Charts einbeziehen"
                      : "Aus Summen und Charts ausblenden"}
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className={excluded ? "opacity-60" : ""}>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-mono text-2xl font-semibold tabular-nums ${
                      available(acc) >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {euroFormatter.format(available(acc))}
                  </span>
                </div>
                {acc.balancePending ? (
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      Saldo: {euroFormatter.format(acc.balance)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="size-3" />
                      Vorgemerkt: {euroFormatter.format(acc.balancePending)}
                    </span>
                  </div>
                ) : null}
                {excluded ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ausgeschlossen aus Summen &amp; Charts
                  </p>
                ) : null}
              </div>

              {transferable && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="mt-auto flex flex-col gap-1">
                      <Button
                        size="sm"
                        className="w-full gap-1"
                        disabled={!transferEnabled}
                        onClick={() => onAccountTransfer?.(acc.accountIban)}
                      >
                        <ArrowUpRight className="size-3.5" />
                        Überweisen
                      </Button>
                      <span className="text-center text-[11px] leading-tight text-muted-foreground">
                        Zahlung erst nach Bestätigung
                      </span>
                    </span>
                  </TooltipTrigger>
                  {!transferEnabled ? (
                    <TooltipContent side="top">
                      Kein Guthaben für eine Überweisung verfügbar
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
