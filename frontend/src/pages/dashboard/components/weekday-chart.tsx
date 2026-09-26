"use client";

import { useId, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

import type { Transaction } from "@/types/transaction";
import { SectionHeading } from "./section-heading";

const RED = "#ff5c6c";
const SUBTLE = "#2a2a40";
const MUTED = "#55556e";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function fmtShort(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    compactDisplay: "short",
  }).format(value);
}

function fmt(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

function buildWeekdaySpending(transactions: Transaction[]) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const t of transactions) {
    if (!t.daten.buchungsdatum || t.betrag.wert >= 0) continue;
    const idx = (new Date(t.daten.buchungsdatum).getDay() + 6) % 7;
    totals[idx] += Math.max(0, Math.abs(t.betrag.wert) - t.betrag.refundTotal);
  }
  return WEEKDAYS.map((day, i) => ({ day, ausgaben: Math.round(totals[i]) }));
}

function WeekdayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-[#12122a] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      <p className="m-0 text-xs text-muted-foreground">{label}</p>
      <p className="m-0 mt-1 font-mono text-base font-semibold tabular-nums" style={{ color: RED }}>
        {fmt(payload[0].value as number)}
      </p>
    </div>
  );
}

type WeekdayChartProps = {
  transactions: Transaction[];
};

export function WeekdayChart({ transactions }: WeekdayChartProps) {
  const data = useMemo(() => buildWeekdaySpending(transactions), [transactions]);
  const uid = useId().replace(/:/g, "");

  const average = useMemo(() => {
    const total = data.reduce((s, d) => s + d.ausgaben, 0);
    return Math.round(total / 7);
  }, [data]);

  if (data.every((d) => d.ausgaben === 0)) return null;

  return (
    <div className="min-w-0 rounded-panel border border-border bg-card p-[22px_22px_14px] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15">
      <SectionHeading>Ausgaben nach Wochentag</SectionHeading>
      <div
        className="h-[180px] [&_svg]:outline-none"
        role="img"
        aria-label="Ausgaben pro Wochentag als Balkendiagramm"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={SUBTLE} strokeDasharray="3 3" vertical={false} />
            <defs>
              <linearGradient id={`wd-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={RED} stopOpacity={1} />
                <stop offset="100%" stopColor={RED} stopOpacity={0.75} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              tick={{ fill: MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 11, className: "font-mono" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtShort}
              width={52}
            />
            <Tooltip content={<WeekdayTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <ReferenceLine
              y={average}
              stroke={MUTED}
              strokeDasharray="3 3"
              label={{ value: "Ø", fill: MUTED, fontSize: 11, position: "right" }}
            />
            <Bar dataKey="ausgaben" fill={`url(#wd-${uid})`} radius={[2, 2, 0, 0]} fillOpacity={0.9} barSize={32} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
