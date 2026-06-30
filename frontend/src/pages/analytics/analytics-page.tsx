import { useMemo } from "react";
import { format } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Loader2,
  CircleDashed,
  CircleX,
  TrendingDown,
  TrendingUp,
  Ellipsis,
  User,
  Building2,
} from "lucide-react";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BankLogo } from "@/components/bank-logo";
import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useFinanceData } from "@/hooks/use-finance-data";
import { useCategories } from "@/hooks/use-categories";
import { usePartnerAnalytics } from "@/hooks/use-partner-analytics";
import { getTimeSpanForRange } from "@/types/time-range";
import type { DateFilterValue } from "@/types/date-filter";

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

function computeDateFooter(dateFilter: DateFilterValue) {
  if (dateFilter.timeSpan) {
    return `${format(dateFilter.timeSpan.from, "dd.MM.yy")} – ${format(dateFilter.timeSpan.until, "dd.MM.yy")}`;
  }
  if (dateFilter.timeRange) {
    const span = getTimeSpanForRange(dateFilter.timeRange);
    return `${format(span.from, "dd.MM.yy")} – ${format(span.until, "dd.MM.yy")}`;
  }
  return null;
}

function groupSmallSlices(
  items: {
    name: string;
    value: number;
    icon?: string | null;
    logoUrl?: string | null;
    logoWhiteBackground?: boolean;
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
  let restSum = sorted
    .filter((item) => item.value < threshold)
    .reduce((s, i) => s + i.value, 0);

  if (big.length >= 10) {
    const extra = big.splice(9).reduce((s, i) => s + i.value, 0);
    restSum += extra;
  }

  if (restSum > 0 && Math.round((restSum / total) * 100) > 0) {
    big.push({ name: restLabel, value: restSum });
  }
  return big;
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: entry } = payload[0];
  const isOther = name === "Weitere Kategorien" || name === "Weitere Zahlungspartner";
  return (
    <div
      className="animate-in fade-in duration-150 rounded-xl px-3.5 py-2.5"
      style={{
        background: "rgba(15, 15, 30, 0.95)",
        border: "1px solid rgba(124, 108, 255, 0.25)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,108,255,0.1)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p className="m-0 flex items-center gap-1.5 text-[11px]" style={{ color: "#7070a0" }}>
        {isOther ? <Ellipsis size={12} /> : entry.icon && <span>{entry.icon}</span>}
        {name}
      </p>
      <p
        className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums tracking-tight"
        style={{ color: "#e8e8f5" }}
      >
        {fmt(value)}
      </p>
    </div>
  );
}

// ─── Card shell ──────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: "#0f0f1e",
        border: "1px solid #1a1a2e",
        borderRadius: 18,
        position: "relative",
      }}
    >
      <div className="flex flex-1 flex-col" style={{ padding: "20px 22px 18px" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Card header ─────────────────────────────────────────────────────────────

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
        <span
          className="text-[12px] font-semibold tracking-wide uppercase"
          style={{ color: "#a0a0c0" }}
        >
          {title}
        </span>
      </div>
      {dateFooter && (
        <span className="text-[10.5px] tracking-wide" style={{ color: "#3a3a5a" }}>
          {dateFooter}
        </span>
      )}
    </div>
  );
}

// ─── Legend row ──────────────────────────────────────────────────────────────

function LegendRow({
  name,
  value,
  total,
  color,
  icon,
  logoUrl,
  logoWhiteBackground,
  logoPadding,
  isCompany,
}: {
  name: string;
  value: number;
  total: number;
  color: string;
  icon?: string | null;
  logoUrl?: string | null;
  logoWhiteBackground?: boolean;
  logoPadding?: boolean;
  isCompany?: boolean;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const isOther = name === "Weitere Kategorien" || name === "Weitere Zahlungspartner";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {/* avatar */}
        {logoUrl && !isOther ? (
          <BankLogo
            src={logoUrl}
            alt={name}
            sizeClassName="size-8 shrink-0"
            backgroundClassName={logoWhiteBackground ? "bg-white" : "bg-[#1a1a2e]"}
            imgNoPadding={!logoPadding}
          />
        ) : (
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-md"
            style={{ background: isOther ? "#1a1a2e" : `${color}22` }}
          >
            {isOther ? (
              <Ellipsis size={14} style={{ color: "#3a3a5a" }} />
            ) : isCompany !== undefined ? (
              isCompany ? (
                <Building2 size={14} style={{ color: "#7070a0" }} />
              ) : (
                <User size={14} style={{ color: "#7070a0" }} />
              )
            ) : (
              <span style={{ fontSize: 12 }}>{icon}</span>
            )}
          </div>
        )}

        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "#7070a0" }}>
          {name}
        </span>
        <span
          className="shrink-0 text-[12px] font-semibold tabular-nums tracking-tight"
          style={{ color: "#d0d0e8" }}
        >
          {fmt(value)}
        </span>
      </div>

      {/* percentage bar */}
      <div className="h-[2px] overflow-hidden rounded-full" style={{ background: "#1a1a2e" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, opacity: 0.7 }}
        />
      </div>
    </div>
  );
}

// ─── Chart card (donut + legend + total) ─────────────────────────────────────

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
    logoWhiteBackground?: boolean;
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
          {/* donut */}
          <div className="shrink-0" style={{ width: donutSize, height: donutSize }} role="img" aria-label={`Kuchendiagramm: ${title}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* legend */}
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
                logoWhiteBackground={entry.logoWhiteBackground}
                logoPadding={entry.logoPadding}
                isCompany={entry.isCompany}
              />
            ))}
          </div>
        </div>
      )}

      {/* total strip */}
      <div
        className="flex items-baseline justify-between pt-3.5 mt-6"
        style={{ borderTop: "1px solid #1a1a2e" }}
      >
        <span className="text-[10.5px] uppercase tracking-wide" style={{ color: "#3a3a5a" }}>
          Gesamt
        </span>
        <span
          className="text-[20px] font-bold tabular-nums tracking-tight"
          style={{ color: "#e8e8f5" }}
        >
          {fmt(total)}
        </span>
      </div>
    </Card>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <Skeleton
            key={i}
            className="h-[340px] rounded-[18px]"
            style={{ background: "#0f0f1e" }}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <Skeleton
            key={i}
            className="h-[320px] rounded-[18px]"
            style={{ background: "#0f0f1e" }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();
  const {
    loading: txLoading,
    refreshing,
    error: txError,
    transactions,
  } = useFinanceData(dateFilter);
  const {
    loading: catLoading,
    error: catError,
    categoryAnalytics,
  } = useCategories({ transactions });
  const { outgoing: partnerOutgoing, incoming: partnerIncoming } = usePartnerAnalytics({
    transactions,
  });

  const loading = txLoading || catLoading;
  const error = txError || catError;
  const dateFooter = useMemo(() => computeDateFooter(dateFilter), [dateFilter]);

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
          logoWhiteBackground: p.logoWhiteBackground,
          logoPadding: p.logoPadding,
          isCompany: p.isCompany,
        })),
        "Weitere Zahlungspartner",
      ) as {
        name: string;
        value: number;
        logoUrl: string | null;
        logoWhiteBackground: boolean;
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
          logoWhiteBackground: p.logoWhiteBackground,
          logoPadding: p.logoPadding,
          isCompany: p.isCompany,
        })),
        "Weitere Zahlungspartner",
      ) as {
        name: string;
        value: number;
        logoUrl: string | null;
        logoWhiteBackground: boolean;
        logoPadding: boolean;
        isCompany: boolean;
      }[],
    [partnerIncoming],
  );

  if (transactions.length === 0 && !loading) {
    return <EmptyState title="Es gibt noch keine Daten" illustration={<CircleDashed />} />;
  }

  if (error) {
    return (
      <EmptyState
        title="Fehler beim Laden der Analysedaten"
        text={`Fehler: ${error}`}
        illustration={<CircleX />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-4">
        <DateFilter value={dateFilter} onChange={setDateFilter} />
        {refreshing && (
          <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "#5a5a7a" }}>
            <Loader2 size={12} className="animate-spin" />
            Aktualisiere…
          </div>
        )}
      </div>

      {loading ? (
        <AnalyticsSkeleton />
      ) : (
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
      )}
    </div>
  );
}
