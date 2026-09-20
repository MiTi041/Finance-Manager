import { useId, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CircleX, TrendingDown, TrendingUp, Ellipsis, User, Building2 } from "lucide-react";
import NumberFlow, { type Format } from "@number-flow/react";

import { EmptyState } from "@/components/empty-state";
import { BankLogo } from "@/components/bank-logo";
import { logoBackgroundClass } from "@/lib/bank/zahlungspartner-logo";
import type { LogoBackground } from "@/lib/zahlungspartner";
import type { Transaction } from "@/types/transaction";
import { useCategories } from "@/hooks/use-categories";
import { usePartnerAnalytics } from "@/hooks/use-partner-analytics";

const EXPENSE_COLORS = [
  "#ff5c6c",
  "#ff8c42",
  "#ffca3a",
  "#ff6b9d",
  "#f72585",
  "#c77dff",
  "#e040fb",
  "#ff4444",
  "#ff9a3c",
  "#ff6584",
];

const INCOME_COLORS = [
  "#00d4a1",
  "#54a0ff",
  "#48dbfb",
  "#1dd1a1",
  "#00b894",
  "#0abde3",
  "#2e86de",
  "#01a3a4",
  "#10ac84",
  "#5f9ea0",
];

function fmt(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const CURRENCY: Format = { style: "currency", currency: "EUR" };

function groupSmallSlices(
  items: {
    name: string;
    value: number;
    icon?: string | null;
    logoUrl?: string | null;
    logoBackground?: LogoBackground;
    logoPadding?: boolean;
    isCompany?: boolean;
  }[],
  restLabel = "Weitere Kategorien",
): typeof items {
  if (items.length === 0) return items;
  const total = items.reduce((s, i) => s + i.value, 0);
  const threshold = total * 0.02;
  const sorted = [...items].sort((a, b) => b.value - a.value);

  const big = sorted.filter((item) => item.value >= threshold);
  let restSum = sorted.filter((item) => item.value < threshold).reduce((s, i) => s + i.value, 0);

  if (big.length >= 10) {
    const extra = big.splice(9).reduce((s, i) => s + i.value, 0);
    restSum += extra;
  }

  if (restSum > 0 && Math.round((restSum / total) * 100) > 0) {
    big.push({ name: restLabel, value: restSum });
  }
  return big;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: entry } = payload[0];
  const isOther = name === "Weitere Kategorien" || name === "Weitere Zahlungspartner";
  return (
    <div
      className="animate-in fade-in duration-150 rounded-xl px-3.5 py-2.5 border border-border"
      style={{
        background: "rgba(15, 15, 30, 0.95)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p className="m-0 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {isOther ? <Ellipsis size={12} /> : entry.icon && <span>{entry.icon}</span>}
        {name}
      </p>
      <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums tracking-tight text-foreground">
        {fmt(value)}
      </p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-panel border border-border bg-card p-[22px_22px_14px] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15">
      {children}
    </div>
  );
}

function CardHeader({
  title,
  dateFooter,
  icon,
  accent = "violet",
}: {
  title: string;
  dateFooter?: string | null;
  icon: React.ReactNode;
  accent?: "violet" | "teal";
}) {
  const iconBg = accent === "teal" ? "rgba(0,212,161,0.12)" : "rgba(124,108,255,0.12)";
  const iconColor = accent === "teal" ? "#00d4a1" : "#7c6cff";
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <span className="text-xs font-medium tracking-[0.06em] uppercase text-muted-foreground">
          {title}
        </span>
      </div>
      {dateFooter && (
        <span className="text-[10.5px] tracking-wide text-muted-foreground/40">{dateFooter}</span>
      )}
    </div>
  );
}

function LegendRow({
  name,
  value,
  total,
  color,
  icon,
  logoUrl,
  logoBackground,
  logoPadding,
  isCompany,
}: {
  name: string;
  value: number;
  total: number;
  color: string;
  icon?: string | null;
  logoUrl?: string | null;
  logoBackground?: LogoBackground;
  logoPadding?: boolean;
  isCompany?: boolean;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const isOther = name === "Weitere Kategorien" || name === "Weitere Zahlungspartner";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {logoUrl && !isOther ? (
          <BankLogo
            src={logoUrl}
            alt={name}
            sizeClassName="size-8 shrink-0"
            backgroundClassName={logoBackgroundClass(logoBackground, "bg-muted")}
            imgNoPadding={!logoPadding}
          />
        ) : (
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-md ${isOther ? "bg-muted" : ""}`}
            style={!isOther ? { background: `${color}22` } : undefined}
          >
            {isOther ? (
              <Ellipsis size={14} className="text-muted-foreground/50" />
            ) : isCompany !== undefined ? (
              isCompany ? (
                <Building2 size={14} className="text-muted-foreground" />
              ) : (
                <User size={14} className="text-muted-foreground" />
              )
            ) : (
              <span style={{ fontSize: 12 }}>{icon}</span>
            )}
          </div>
        )}

        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{name}</span>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums tracking-tight text-foreground">
          {fmt(value)}
        </span>
      </div>

      <div className="h-[2px] overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, opacity: 0.7 }}
        />
      </div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  dateFooter,
  colors,
  accent,
  donutSize = 200,
  innerRadius = 66,
  outerRadius = 92,
}: {
  title: string;
  data: {
    name: string;
    value: number;
    icon?: string | null;
    logoUrl?: string | null;
    logoBackground?: LogoBackground;
    logoPadding?: boolean;
    isCompany?: boolean;
  }[];
  dateFooter?: string | null;
  colors: string[];
  accent: "violet" | "teal";
  donutSize?: number;
  innerRadius?: number;
  outerRadius?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const uid = useId().replace(/:/g, "");

  return (
    <Card>
      <CardHeader
        title={title}
        dateFooter={dateFooter}
        accent={accent}
        icon={accent === "teal" ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
      />

      {data.length === 0 ? (
        <EmptyState title="Keine Daten" illustration={<CircleX />} />
      ) : (
        <div className="flex flex-1 items-center gap-5">
          <div
            className="shrink-0"
            style={{ width: donutSize, height: donutSize }}
            role="img"
            aria-label={`Kuchendiagramm: ${title}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {data.map((_, i) => {
                    const c = colors[i % colors.length];
                    return (
                      <linearGradient key={i} id={`donut-${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={1} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.75} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={`url(#donut-${uid}-${i})`} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {data.map((entry, i) => (
              <LegendRow
                key={entry.name}
                name={entry.name}
                value={entry.value}
                total={total}
                color={colors[i % colors.length]}
                icon={entry.icon}
                logoUrl={entry.logoUrl}
                logoBackground={entry.logoBackground}
                logoPadding={entry.logoPadding}
                isCompany={entry.isCompany}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between pt-3.5 mt-6 border-t border-border">
        <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground/50">
          Gesamt
        </span>
        <NumberFlow
          value={total}
          format={CURRENCY}
          locales="de-DE"
          className="text-[20px] font-bold tabular-nums tracking-tight text-foreground"
        />
      </div>
    </Card>
  );
}

type AnalyticsChartsProps = {
  transactions: Transaction[];
  dateFooter?: string | null;
};

export function AnalyticsCharts({ transactions, dateFooter }: AnalyticsChartsProps) {
  const { categoryAnalytics } = useCategories({ transactions });
  const { outgoing: partnerOutgoing, incoming: partnerIncoming } = usePartnerAnalytics({
    transactions,
  });

  const expenseData = useMemo(
    () =>
      groupSmallSlices(
        categoryAnalytics
          .filter((a) => a.typ === "Ausgabe" && a.totalAmount < 0)
          .map((a) => ({ name: a.name, value: Math.abs(a.totalAmount), icon: a.icon }))
          .sort((a, b) => b.value - a.value),
      ) as { name: string; value: number; icon: string | null }[],
    [categoryAnalytics],
  );

  const incomeData = useMemo(
    () =>
      groupSmallSlices(
        categoryAnalytics
          .filter((a) => a.typ === "Einnahme" && a.totalAmount > 0)
          .map((a) => ({ name: a.name, value: a.totalAmount, icon: a.icon }))
          .sort((a, b) => b.value - a.value),
      ) as { name: string; value: number; icon: string | null }[],
    [categoryAnalytics],
  );

  const partnerExpenseData = useMemo(
    () =>
      groupSmallSlices(
        partnerOutgoing.map((p) => ({
          name: p.name,
          value: p.totalAmount,
          logoUrl: p.logoUrl,
          logoBackground: p.logoBackground,
          logoPadding: p.logoPadding,
          isCompany: p.isCompany,
        })),
        "Weitere Zahlungspartner",
      ) as {
        name: string;
        value: number;
        logoUrl: string | null;
        logoBackground: LogoBackground;
        logoPadding: boolean;
        isCompany: boolean;
      }[],
    [partnerOutgoing],
  );

  const partnerIncomeData = useMemo(
    () =>
      groupSmallSlices(
        partnerIncoming.map((p) => ({
          name: p.name,
          value: p.totalAmount,
          logoUrl: p.logoUrl,
          logoBackground: p.logoBackground,
          logoPadding: p.logoPadding,
          isCompany: p.isCompany,
        })),
        "Weitere Zahlungspartner",
      ) as {
        name: string;
        value: number;
        logoUrl: string | null;
        logoBackground: LogoBackground;
        logoPadding: boolean;
        isCompany: boolean;
      }[],
    [partnerIncoming],
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Ausgaben"
          data={expenseData}
          dateFooter={dateFooter}
          colors={EXPENSE_COLORS}
          accent="violet"
        />
        <ChartCard
          title="Einnahmen"
          data={incomeData}
          dateFooter={dateFooter}
          colors={INCOME_COLORS}
          accent="teal"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Zahlungspartner Ausgaben"
          data={partnerExpenseData}
          dateFooter={dateFooter}
          colors={EXPENSE_COLORS}
          accent="violet"
        />
        <ChartCard
          title="Zahlungspartner Einnahmen"
          data={partnerIncomeData}
          dateFooter={dateFooter}
          colors={INCOME_COLORS}
          accent="teal"
        />
      </div>
    </>
  );
}
