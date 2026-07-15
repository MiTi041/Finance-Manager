import { useMemo } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import type { Subscription } from "@/pages/subscriptions/hooks/use-subscriptions";
import { SectionHeading } from "@/pages/dashboard/components/section-heading";

const RED = "#ff5c6c";
const SUBTLE = "#2a2a40";
const MUTED = "#55556e";

function fmtShort(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    compactDisplay: "short",
  }).format(value);
}

type DataPoint = {
  month: string;
  fullLabel: string;
  ausgaben: number;
};

function buildMonthlySubscriptionSpending(subscriptions: Subscription[]): DataPoint[] {
  const months: Record<string, number> = {};
  for (const sub of subscriptions) {
    for (const tx of sub.transactions) {
      const key = format(new Date(tx.date), "yyyy-MM");
      months[key] = (months[key] ?? 0) + Math.abs(tx.amount);
    }
  }
  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24)
    .map(([key, total]) => ({
      month: format(new Date(key + "-01"), "MMM", { locale: de }),
      fullLabel: format(new Date(key + "-01"), "MMM yyyy", { locale: de }),
      ausgaben: Math.round(total),
    }));
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as DataPoint | undefined;
  return (
    <div className="min-w-[160px] rounded-xl border border-border bg-[#12122a] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
      <p className="m-0 mb-2 text-xs text-muted-foreground">{data?.fullLabel ?? label}</p>
      <p className="m-0 mt-0.5 text-[13px] tabular-nums" style={{ color: RED }}>
        <span className="opacity-70">Ausgaben  </span>
        {data ? fmtShort(data.ausgaben) : ""}
      </p>
    </div>
  );
}

type Props = {
  subscriptions: Subscription[];
};

export function SubscriptionMonthlyChart({ subscriptions }: Props) {
  const data = useMemo(() => buildMonthlySubscriptionSpending(subscriptions), [subscriptions]);

  return (
    <div className="min-w-0 flex-[0_0_320px] rounded-panel border border-border bg-card p-[22px_22px_14px] outline-none">
      <SectionHeading>Abo-Ausgaben pro Monat (letzte 24 Monate)</SectionHeading>
      <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <div className="size-2 rounded-sm" style={{ background: RED }} />
        Ausgaben
      </div>
      <div className="h-[200px] [&_svg]:outline-none" role="img" aria-label="Monatliche Abo-Ausgaben als Balkendiagramm">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barSize={20}
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
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="ausgaben" fill={RED} radius={[2, 2, 0, 0]} fillOpacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
