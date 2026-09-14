import type { ComponentType, ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import NumberFlow, { type Format } from "@number-flow/react";

const euroFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

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
  pendingValue?: number;
  action?: ReactNode;
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
  pendingValue,
  action,
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
      {footer && <div className="text-[11px] text-muted-foreground/50">{footer}</div>}
      {action && <div className="mt-auto">{action}</div>}
    </div>
  );
}