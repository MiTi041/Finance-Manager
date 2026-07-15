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

function buildBalanceHistory(
  transactions: Transaction[],
  anchorBalance: number | null = null,
) {
  if (transactions.length === 0) return [];

  let minDate = new Date();
  let maxDate = new Date(0);
  for (const t of transactions) {
    if (!t.daten.buchungsdatum) continue;
    const d = new Date(t.daten.buchungsdatum);
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  }

  const rangeDays = Math.round(
    (maxDate.getTime() - minDate.getTime()) / 86400000,
  );
  const bucketCount = rangeDays + 1;

  const buckets: Record<string, number> = {};
  const cursor = new Date(minDate);
  while (cursor <= maxDate) {
    buckets[format(cursor, "yyyy-MM-dd")] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }

  const sorted = [...transactions].sort(
    (a, b) =>
      new Date(a.daten.buchungsdatum ?? 0).getTime() -
      new Date(b.daten.buchungsdatum ?? 0).getTime(),
  );
  for (const t of sorted) {
    const key = t.daten.buchungsdatum
      ? format(new Date(t.daten.buchungsdatum), "yyyy-MM-dd")
      : null;
    if (key && key in buckets) buckets[key] += t.betrag.wert;
  }

  const sumOfWindow = Object.values(buckets).reduce((s, v) => s + v, 0);
  const offset = anchorBalance !== null ? anchorBalance - sumOfWindow : 0;

  const keys = Object.keys(buckets).sort();

  let acc = offset;
  return keys.map((k, i) => {
    acc += buckets[k];
    return {
      date: dateLabel(new Date(k), rangeDays),
      _sortKey: k,
      value: Math.round(acc * 100) / 100,
    };
  });
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function AreaTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-[#12122a] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      <p className="m-0 text-xs text-muted-foreground">{payload[0]?.payload?.date}</p>
      <p className="m-0 mt-1 text-base font-semibold tabular-nums text-[#f0f0fa]">
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
  transactions: Transaction[];
  currentBalance: number;
};

export function BalanceChart({ transactions, currentBalance }: BalanceChartProps) {
  const data = useMemo(
    () => buildBalanceHistory(transactions, currentBalance),
    [transactions, currentBalance],
  );

  const totalDays = data.length;
  const labelInterval = Math.max(1, Math.floor(totalDays / 15));

  const rangeLabel = useMemo(() => {
    if (totalDays <= 1) return "Kontostand · Heute";
    return `Kontostand · ${totalDays} Tage`;
  }, [totalDays]);

  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));
  const padding = (max - min) * 0.12;
  const isPositive = data[data.length - 1]?.value >= data[0]?.value;
  const accentColor = isPositive ? GREEN : RED;

  return (
    <div className="min-w-0 flex-1 rounded-panel border border-border bg-card p-[22px_22px_14px] outline-none">
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
              tick={{ fill: MUTED, fontSize: 11 }}
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
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
