import type { ComponentType, ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import NumberFlow, { type Format } from "@number-flow/react";
import { BankLogo } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";

const euroFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

type AccountBalance = {
  bankLogo?: string;
  accountIban: string;
  accountName: string;
  bankName: string;
  balance: number;
  balancePending?: number;
};

type StatCardProps = {
  title: string;
  value: number;
  valueFormat?: Format;
  valueLocales?: Intl.LocalesArgument;
  sub?: string;
  trend?: "up" | "down";
  accent: string;
  icon: ComponentType<{ size?: number }>;
  footer?: string;
  accountBalances?: AccountBalance[];
  pendingValue?: number;
  action?: ReactNode;
  transferableIbans?: Set<string>;
  onAccountTransfer?: (iban: string) => void;
};

export function StatCard({
  title,
  value,
  valueFormat,
  valueLocales,
  sub,
  trend,
  accent,
  icon: Icon,
  footer,
  accountBalances,
  pendingValue,
  action,
  transferableIbans,
  onAccountTransfer,
}: StatCardProps) {
  return (
    <div className="flex cursor-default flex-col gap-3 rounded-panel border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-[0.06em] uppercase text-muted-foreground">
          {title}
        </span>
        <div
          className="flex size-8 items-center justify-center rounded-lg"
          style={{ background: `${accent}20`, color: accent }}
        >
          <Icon size={15} />
        </div>
      </div>
      <div className="flex-1">
        {sub && (
          <div
            className="mt-1.5 flex items-center gap-1 text-xs"
            style={{
              color: trend === "up" ? "#00d4a1" : trend === "down" ? "#ff5c6c" : undefined,
            }}
          >
            {trend === "up" && <ArrowUpRight size={13} />}
            {trend === "down" && <ArrowDownRight size={13} />}
            {sub}
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <NumberFlow
            value={value}
            format={valueFormat}
            locales={valueLocales}
            className="text-[26px] font-bold tabular-nums tracking-tight text-foreground"
          />
          {pendingValue != null && pendingValue !== 0 && (
            <span className="text-sm font-medium tabular-nums text-muted-foreground/60">
              {euroFormatter.format(value + pendingValue)}
            </span>
          )}
        </div>
        {pendingValue != null && pendingValue !== 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={13} />
            <span>Vorgemerkt:</span>
            <span className="tabular-nums">{euroFormatter.format(pendingValue)}</span>
          </div>
        )}
      </div>
      {accountBalances && (
        <div className="space-y-2 border-t border-border pt-3">
          {accountBalances.map((acc) => (
            <div
              key={acc.accountIban}
              className="flex flex-col gap-2 p-2 bg-muted rounded-sm"
            >
              <div className="flex items-center gap-2">
                <BankLogo
                  src={acc.bankLogo || undefined}
                  alt={acc.accountName || acc.bankName || "Bank"}
                  sizeClassName="size-10 shrink-0 p-1 rounded border-0 bg-muted"
                  kind="company"
                />
                <div className="flex items-start flex-col justify-start">
                  <span
                    className={`font-mono text-xs text-muted-foreground tabular-nums text-foreground`}
                  >
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
                  className="w-full gap-1"
                  onClick={() => onAccountTransfer?.(acc.accountIban)}
                >
                  <ArrowUpRight className="size-3.5" />
                  Überweisen
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {footer && <div className="text-[11px] text-muted-foreground/50">{footer}</div>}
      {action && <div className="mt-auto">{action}</div>}
    </div>
  );
}