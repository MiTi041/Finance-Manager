"use client";

import { useId, useMemo } from "react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

import type { Transaction } from "@/types/transaction";
import { SectionHeading } from "./section-heading";

const GREEN = "#00d4a1";
const RED = "#ff5c6c";
const SUBTLE = "#2a2a40";
const MUTED = "#55556e";

function buildSavingsRates(transactions: Transaction[]) {
  const months: Record<string, { einnahmen: number; ausgaben: number }> = {};
  for (const t of transactions) {
    if (!t.daten.buchungsdatum) continue;
    const key = format(new Date(t.daten.buchungsdatum), "yyyy-MM");
    if (!months[key]) months[key] = { einnahmen: 0, ausgaben: 0 };
    if (t.betrag.wert > 0)
      months[key].einnahmen += Math.max(0, t.betrag.wert - t.refundAttributed);
    else months[key].ausgaben += Math.max(0, Math.abs(t.betrag.wert) - t.betrag.refundTotal);
  }
  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, v]) => v.einnahmen > 0)
    .slice(-12)
    .map(([key, v]) => ({
      month: format(new Date(key + "-01"), "MMM"),
      rate: Math.round(((v.einnahmen - v.ausgaben) / v.einnahmen) * 100),
    }));
}

function RateTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rate = payload[0].value as number;
  return (
    <div className="rounded-xl border border-border bg-[#12122a] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      <p className="m-0 text-xs text-muted-foreground">{label}</p>
      <p
        className="m-0 mt-1 text-base font-semibold tabular-nums"
        style={{ color: rate >= 0 ? GREEN : RED }}
      >
        {rate} %
      </p>
    </div>
  );
}

type SavingsRateChartProps = {
  transactions: Transaction[];
};

export function SavingsRateChart({ transactions }: SavingsRateChartProps) {
  const data = useMemo(() => buildSavingsRates(transactions), [transactions]);
  const uid = useId().replace(/:/g, "");

  if (data.length === 0) return null;

  return (
    <div className="min-w-0 rounded-panel border border-border bg-card p-[22px_22px_14px] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15">
      <SectionHeading>Sparquote (letzte 12 Monate)</SectionHeading>
      <div
        className="h-[180px] [&_svg]:outline-none"
        role="img"
        aria-label="Sparquote pro Monat als Balkendiagramm"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={SUBTLE} strokeDasharray="3 3" vertical={false} />
            <defs>
              <linearGradient id={`srPos-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity={1} />
                <stop offset="100%" stopColor={GREEN} stopOpacity={0.75} />
              </linearGradient>
              <linearGradient id={`srNeg-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={RED} stopOpacity={1} />
                <stop offset="100%" stopColor={RED} stopOpacity={0.75} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}%`}
              width={44}
            />
            <Tooltip content={<RateTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <ReferenceLine y={0} stroke={MUTED} strokeDasharray="3 3" />
            <Bar dataKey="rate" radius={[2, 2, 0, 0]} fillOpacity={0.9} barSize={22} animationDuration={700}>
              {data.map((d) => (
                <Cell key={d.month} fill={`url(#sr${d.rate >= 0 ? "Pos" : "Neg"}-${uid})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
