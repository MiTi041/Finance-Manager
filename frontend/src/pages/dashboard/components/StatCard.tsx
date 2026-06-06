import type { ComponentType } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import NumberFlow, { type Format } from "@number-flow/react";

type AccountBalance = {
  accountIban: string;
  accountName: string;
  bankName: string;
  balance: number;
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
        <NumberFlow
          value={value}
          format={valueFormat}
          locales={valueLocales}
          className="pr-8 text-[26px] font-bold tabular-nums tracking-tight text-foreground"
        />
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
      </div>
      {accountBalances && (
        <div className="space-y-1 border-t border-border pt-3">
          {accountBalances.map((acc) => (
            <div
              key={acc.accountIban}
              className="flex items-center justify-between text-sm"
            >
              <span className="truncate text-muted-foreground">{acc.accountName}</span>
              <span className={`tabular-nums ${acc.balance >= 0 ? "text-foreground" : "text-red-500"}`}>
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(acc.balance)}
              </span>
            </div>
          ))}
        </div>
      )}
      {footer && <div className="text-[11px] text-muted-foreground/50">{footer}</div>}
    </div>
  );
}
