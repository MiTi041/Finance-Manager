"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { Transaction } from "@/types/transaction";
import { SectionHeading } from "./SectionHeading";

// ─── Build chart data ───────────────────────────────────────────────────────

function buildMonthlyBreakdown(transactions: Transaction[]) {
  const months: Record<string, { einnahmen: number; ausgaben: number }> = {};
  for (const t of transactions) {
    if (!t.daten.buchungsdatum) continue;
    const key = format(new Date(t.daten.buchungsdatum), "yyyy-MM");
    if (!months[key]) months[key] = { einnahmen: 0, ausgaben: 0 };
    if (t.betrag.wert > 0) months[key].einnahmen += t.betrag.wert;
    else months[key].ausgaben += Math.abs(t.betrag.wert);
  }
  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, v]) => ({
      month: format(new Date(key + "-01"), "MMM"),
      einnahmen: Math.round(v.einnahmen),
      ausgaben: Math.round(v.ausgaben),
    }));
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

const GREEN = "#00d4a1";
const RED = "#ff5c6c";

function fmtShort(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    compactDisplay: "short",
  }).format(value);
}

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-xl border border-border bg-[#12122a] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      <p className="m-0 mb-2 text-xs text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <p
          key={p.dataKey}
          className="m-0 mt-0.5 text-[13px] tabular-nums"
          style={{ color: p.dataKey === "einnahmen" ? GREEN : RED }}
        >
          <span className="opacity-70">
            {p.dataKey === "einnahmen" ? "Einnahmen  " : "Ausgaben  "}
          </span>
          {fmtShort(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

const SUBTLE = "#2a2a40";
const MUTED = "#55556e";

type MonthlyChartProps = {
  transactions: Transaction[];
};

export function MonthlyChart({ transactions }: MonthlyChartProps) {
  const data = useMemo(() => buildMonthlyBreakdown(transactions), [transactions]);

  return (
    <div className="min-w-0 flex-[0_0_320px] rounded-panel border border-border bg-card p-[22px_22px_14px]">
      <SectionHeading>Einnahmen vs. Ausgaben</SectionHeading>
      <div className="mb-4 flex gap-3">
        {[
          { label: "Einnahmen", color: GREEN },
          { label: "Ausgaben", color: RED },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="size-2 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
      <div className="h-[164px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barSize={8}
            barGap={4}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={SUBTLE} strokeDasharray="3 3" vertical={false} />
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
              tickFormatter={fmtShort}
              width={52}
            />
            <Tooltip
              content={<BarTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <Bar dataKey="einnahmen" fill={GREEN} radius={[3, 3, 0, 0]} fillOpacity={0.85} />
            <Bar dataKey="ausgaben" fill={RED} radius={[3, 3, 0, 0]} fillOpacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
