"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { Transaction } from "@/types/transaction";
import { SectionHeading } from "./section-heading";
import { buildBalanceHistory, sliceBalanceHistory } from "./balance-history";

// ─── Formatting ─────────────────────────────────────────────────────────────

function fmt(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

function fmtShort(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    compactDisplay: "short",
  }).format(value);
}

// ─── Build chart data ───────────────────────────────────────────────────────

function dateLabel(date: Date, rangeDays: number) {
  return rangeDays > 370 ? format(date, "dd.MM.yy") : format(date, "dd.MM");
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function AreaTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-[#12122a] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      <p className="m-0 text-xs text-muted-foreground">{payload[0]?.payload?.date}</p>
      <p className="m-0 mt-1 font-mono text-base font-semibold tabular-nums text-[#f0f0fa]">
        {fmt(payload[0]?.value ?? 0)}
      </p>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

const GREEN = "#00d4a1";
const RED = "#ff5c6c";
const SUBTLE = "#2a2a40";
const MUTED = "#55556e";

type BalanceChartProps = {
  /** Date-filtered transactions: define the visible window. */
  transactions: Transaction[];
  /** All-time transactions of the account: build the running balance. */
  allTransactions: Transaction[];
  currentBalance: number;
};

export function BalanceChart({
  transactions,
  allTransactions,
  currentBalance,
}: BalanceChartProps) {
  const data = useMemo(() => {
    const sliced = sliceBalanceHistory(
      buildBalanceHistory(allTransactions, currentBalance),
      transactions,
    );
    const rangeDays =
      sliced.length > 0
        ? Math.round(
            (new Date(sliced[sliced.length - 1]._sortKey).getTime() -
              new Date(sliced[0]._sortKey).getTime()) /
              86400000,
          )
        : 0;
    return sliced.map((p) => ({
      date: dateLabel(new Date(p._sortKey), rangeDays),
      _sortKey: p._sortKey,
      value: p.value,
    }));
  }, [allTransactions, transactions, currentBalance]);

  const totalDays = data.length;
  const labelInterval = Math.max(1, Math.floor(totalDays / 15));

  const rangeLabel = useMemo(() => {
    if (totalDays <= 1) return "Kontostand · Heute";
    return `Kontostand · ${totalDays} Tage`;
  }, [totalDays]);

  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));
  const padding = (max - min) * 0.12;
  const isPositive = (data[data.length - 1]?.value ?? 0) >= 0;
  const accentColor = isPositive ? GREEN : RED;

  return (
    <div className="min-w-0 flex-1 rounded-panel border border-border bg-card p-[22px_22px_14px] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15">
      <SectionHeading>{rangeLabel}</SectionHeading>
      <div className="h-[200px] [&_svg]:outline-none" role="img" aria-label="Kontostand-Entwicklung als Liniendiagramm">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={SUBTLE} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={labelInterval}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 11, className: "font-mono" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtShort}
              domain={[min - padding, max + padding]}
              width={60}
            />
            <Tooltip
              content={<AreaTooltip />}
              cursor={{ stroke: "rgba(255,255,255,0.13)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={accentColor}
              strokeWidth={2}
              fill="url(#balGrad)"
              dot={false}
              activeDot={{ r: 4, fill: accentColor, stroke: "transparent" }}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
