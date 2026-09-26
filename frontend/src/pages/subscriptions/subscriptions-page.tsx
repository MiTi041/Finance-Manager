import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CircleX, EyeOff, Repeat, TrendingUp, Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchParams } from "react-router-dom";
import { VirtualizedList, type VirtualizedListRef } from "@/components/virtualized-list";
import {
  createSubscriptionIdentity,
  deleteSubscriptionIdentity,
  fetchChartSubscriptions,
  listSubscriptionIdentities,
  updateSubscriptionIdentity,
  useSubscriptions,
  type Subscription,
  type SubscriptionFrequency,
} from "@/pages/subscriptions/hooks/use-subscriptions";
import { createZahlungspartner, fetchZahlungspartnerReferenceData } from "@/lib/zahlungspartner";
import type { ZahlungspartnerRecord } from "@/lib/zahlungspartner";
import { totalMonthlyAmount } from "@/lib/subscription-budget";
import { formatAmount } from "@/lib/utils/format";
import { StatCard } from "@/pages/dashboard/components/stat-card";
import { toast } from "sonner";

import { SubscriptionRow } from "./components/subscription-row";
import {
  SubscriptionMonthlyChart,
  buildMonthlySubscriptionSpending,
  monthKeyOf,
  type ChartHighlight,
} from "./components/subscription-monthly-chart";

const FREQUENCY_ORDER: SubscriptionFrequency[] = ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"];

type SectionItem = {
  type: "section";
  key: string;
  label: string;
  count: number;
  monthlyTotal: number;
};

const UNCATEGORIZED_KEY = "__uncategorized__";

type SubscriptionItem = {
  type: "subscription";
  data: Subscription;
};

type ListItem = SectionItem | SubscriptionItem;

const FREQUENCY_OPTIONS: { value: "ALL" | SubscriptionFrequency; label: string }[] = [
  { value: "ALL", label: "Alle Frequenzen" },
  { value: "MONTHLY", label: "Monatlich" },
  { value: "SEMI_ANNUAL", label: "Halbjährlich" },
  { value: "ANNUAL", label: "Jährlich" },
];

export default function SubscriptionsPage() {
  const {
    loading,
    error,
    grouped,
    subscriptions,
    reload,
    removeSubscription,
    includeDismissed,
    setIncludeDismissed,
  } = useSubscriptions();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [zahlungspartnerList, setZahlungspartnerList] = useState<ZahlungspartnerRecord[]>([]);
  const [chartSubscriptions, setChartSubscriptions] = useState<Subscription[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [hasHiddenIdentities, setHasHiddenIdentities] = useState(false);
  const [hiddenLoaded, setHiddenLoaded] = useState(false);
  const [frequencyFilter, setFrequencyFilter] = useState<"ALL" | SubscriptionFrequency>("ALL");
  const [searchParams, setSearchParams] = useSearchParams();
  const virtualListRef = useRef<VirtualizedListRef>(null);
  const highlightRef = useRef(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartHighlight, setChartHighlight] = useState<ChartHighlight | null>(null);

  const chartData = useMemo(
    () => buildMonthlySubscriptionSpending(chartSubscriptions),
    [chartSubscriptions],
  );

  const handleTransactionClick = useCallback(
    (date: string, direction: "income" | "expense") => {
      const monthKey = monthKeyOf(date);
      if (!chartData.some((d) => d.monthKey === monthKey)) {
        toast("Für diesen Monat zeigt das Diagramm keine Buchung.");
        return;
      }
      setChartHighlight({ monthKey, direction });
      chartRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [chartData],
  );

  useEffect(() => {
    if (!chartHighlight) return;
    const timer = setTimeout(() => setChartHighlight(null), 3000);
    return () => clearTimeout(timer);
  }, [chartHighlight]);

  const refreshChart = useCallback(() => {
    setChartLoading(true);
    fetchChartSubscriptions()
      .then((data) => setChartSubscriptions(data))
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, []);

  useEffect(() => {
    refreshChart();
  }, [refreshChart]);

  useEffect(() => {
    let cancelled = false;
    listSubscriptionIdentities()
      .then((data) => {
        if (!cancelled) {
          setHasHiddenIdentities(
            (data.identities ?? []).some((identity) => identity.dismissed || identity.ended),
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHiddenLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const name = searchParams.get("name");
    const amount = searchParams.get("amount");
    if (!name || !amount || loading || subscriptions.length === 0 || highlightRef.current) return;

    const key = `${name}|${Number(amount)}`;
    const found = subscriptions.find((sub) => getSubKey(sub) === key);
    if (found) {
      setFrequencyFilter("ALL");
      setExpandedKey(key);
      requestAnimationFrame(() => {
        virtualListRef.current?.scrollToItem(`sub-${key}`, "center");
      });
    }
    highlightRef.current = true;
    setSearchParams({}, { replace: true });
  }, [searchParams, loading, subscriptions, setSearchParams]);

  useEffect(() => {
    fetchZahlungspartnerReferenceData()
      .then((data) => setZahlungspartnerList(data.zahlungspartner))
      .catch(() => {});
  }, []);

  const handleLinkIdentity = useCallback(
    async (counterpartyName: string, amount: number, zahlungspartnerId: number) => {
      try {
        await createSubscriptionIdentity({
          counterpartyName,
          amount,
          zahlungspartnerId,
        });
        await reload();
        toast.success("Zahlungspartner verknüpft");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Zahlungspartner konnte nicht verknüpft werden",
        );
      }
    },
    [reload],
  );

  const handleCreateAndLinkIdentity = useCallback(
    async (counterpartyName: string, amount: number, name: string) => {
      try {
        const zahlungspartner = await createZahlungspartner({
          name,
          is_company: true,
        });
        await createSubscriptionIdentity({
          counterpartyName,
          amount,
          zahlungspartnerId: zahlungspartner.id,
        });
        const data = await fetchZahlungspartnerReferenceData({ forceRefresh: true });
        setZahlungspartnerList(data.zahlungspartner);
        await reload();
        toast.success(`"${name}" angelegt und verknüpft`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Zahlungspartner konnte nicht angelegt werden",
        );
      }
    },
    [reload],
  );

  const handleDismissIdentity = useCallback(
    async (counterpartyName: string, amount: number) => {
      removeSubscription(counterpartyName, amount);
      try {
        await createSubscriptionIdentity({
          counterpartyName,
          amount,
          dismissed: true,
        });
        refreshChart();
        toast.success("Abonnement ausgeblendet");
      } catch (err) {
        await reload();
        toast.error(
          err instanceof Error ? err.message : "Abonnement konnte nicht ausgeblendet werden",
        );
      }
    },
    [reload, removeSubscription, refreshChart],
  );

  const handleEndSubscription = useCallback(
    async (counterpartyName: string, amount: number) => {
      removeSubscription(counterpartyName, amount);
      try {
        await createSubscriptionIdentity({
          counterpartyName,
          amount,
          ended: true,
        });
        refreshChart();
        toast.success("Abonnement als nicht mehr aktiv markiert");
      } catch (err) {
        await reload();
        toast.error(
          err instanceof Error
            ? err.message
            : "Abonnement konnte nicht als beendet markiert werden",
        );
      }
    },
    [reload, removeSubscription, refreshChart],
  );

  const handleReactivateSubscription = useCallback(
    async (identityId: number) => {
      try {
        await updateSubscriptionIdentity(identityId, { ended: false });
        await reload();
        refreshChart();
        toast.success("Abonnement wieder aktiviert");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Abonnement konnte nicht wieder aktiviert werden",
        );
      }
    },
    [reload, refreshChart],
  );

  const handleRemoveIdentity = useCallback(
    async (counterpartyName: string, amount: number) => {
      try {
        const data = await listSubscriptionIdentities();
        const match = data.identities.find(
          (id) => id.counterpartyName === counterpartyName && id.amount === amount,
        );
        if (match) {
          await deleteSubscriptionIdentity(match.id);
          await reload();
          toast.success("Identität zurückgesetzt");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Identität konnte nicht entfernt werden");
      }
    },
    [reload],
  );

  const handleRestoreSubscription = useCallback(
    async (identityId: number) => {
      try {
        await updateSubscriptionIdentity(identityId, { dismissed: false });
        await reload();
        refreshChart();
        toast.success("Abonnement wiederhergestellt");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Abonnement konnte nicht wiederhergestellt werden",
        );
      }
    },
    [reload, refreshChart],
  );

  const flatItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    const sortSubs = (subs: Subscription[]) =>
      [...subs].sort((a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime());

    const byCategory = new Map<string, Subscription[]>();
    for (const sub of subscriptions) {
      if (frequencyFilter !== "ALL" && sub.frequency !== frequencyFilter) continue;
      const key = sub.categoryTopName ?? sub.categoryName ?? UNCATEGORIZED_KEY;
      const list = byCategory.get(key);
      if (list) list.push(sub);
      else byCategory.set(key, [sub]);
    }
    const groups = [...byCategory.entries()]
      .sort(([a], [b]) => {
        if (a === UNCATEGORIZED_KEY) return 1;
        if (b === UNCATEGORIZED_KEY) return -1;
        return a.localeCompare(b, "de");
      })
      .map(([key, subs]) => ({
        key,
        label: key === UNCATEGORIZED_KEY ? "Ohne Kategorie" : key,
        subs,
      }));

    for (const group of groups) {
      if (group.subs.length === 0) continue;
      const sorted = sortSubs(group.subs);
      items.push({
        type: "section",
        key: group.key,
        label: group.label,
        count: sorted.length,
        monthlyTotal: totalMonthlyAmount(sorted),
      });
      for (const sub of sorted) {
        items.push({ type: "subscription", data: sub });
      }
    }
    return items;
  }, [subscriptions, frequencyFilter]);

  const subscriptionCount = useMemo(
    () => flatItems.filter((item) => item.type === "subscription").length,
    [flatItems],
  );

  const getSubKey = (sub: Subscription) => `${sub._counterpartyName || sub.name}|${sub.amount}`;

  const toggleRow = (sub: Subscription) => {
    const key = getSubKey(sub);
    setExpandedKey((current) => (current === key ? null : key));
  };

  const getItemHeight = (item: ListItem) => {
    if (item.type === "section") return 40;
    if (expandedKey !== getSubKey(item.data)) return 88;
    const count = item.data.transactions?.length ?? 0;
    return 520 + count * 32;
  };

  const monthlyTotal = useMemo(
    () =>
      grouped.MONTHLY.reduce(
        (sum, s) => sum + (s.direction === "income" ? 0 : s.effectiveAmount),
        0,
      ),
    [grouped],
  );

  const monthlyIncome = useMemo(
    () =>
      grouped.MONTHLY.reduce(
        (sum, s) => sum + (s.direction === "income" ? s.effectiveAmount : 0),
        0,
      ),
    [grouped],
  );

  const normalizedMonthlyTotal = useMemo(
    () =>
      grouped.MONTHLY.reduce(
        (sum, s) => sum + (s.direction === "income" ? 0 : s.effectiveAmount),
        0,
      ) +
      grouped.SEMI_ANNUAL.reduce(
        (sum, s) => sum + (s.direction === "income" ? 0 : s.effectiveAmount),
        0,
      ) /
        6 +
      grouped.ANNUAL.reduce(
        (sum, s) => sum + (s.direction === "income" ? 0 : s.effectiveAmount),
        0,
      ) /
        12,
    [grouped],
  );

  if (error) {
    return (
      <EmptyState
        title="Fehler beim Laden der Abonnements"
        text={`Fehler: ${error}`}
        illustration={<CircleX />}
      />
    );
  }

  const hasSubscriptions = FREQUENCY_ORDER.some((f) => grouped[f].length > 0);
  const hasAnySubscriptions = hasSubscriptions || chartSubscriptions.length > 0;

  if (!loading && !chartLoading && hiddenLoaded && !hasAnySubscriptions && !hasHiddenIdentities) {
    return (
      <EmptyState
        title="Keine Abonnements gefunden"
        text="Es wurden noch keine regelmäßigen Buchungen erkannt."
        illustration={<Repeat />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6">
      <div className="flex w-full flex-wrap gap-6">
        <div className="w-full max-w-xs">
          <StatCard
            title="Monatliche Ausgaben"
            value={monthlyTotal}
            valueFormat={{ style: "currency", currency: "EUR" }}
            valueLocales="de-DE"
            accent="#ff5c6c"
            icon={Wallet}
          />
        </div>
        <div className="w-full max-w-xs">
          <StatCard
            title="Monatliche Einnahmen"
            value={monthlyIncome}
            valueFormat={{ style: "currency", currency: "EUR" }}
            valueLocales="de-DE"
            accent="#00d4a1"
            icon={TrendingUp}
          />
        </div>
        <div className="w-full max-w-xs">
          <StatCard
            title="Ø Monatlich (alle Abos)"
            value={normalizedMonthlyTotal}
            valueFormat={{ style: "currency", currency: "EUR" }}
            valueLocales="de-DE"
            accent="#00d4a1"
            icon={CalendarClock}
          />
        </div>
      </div>
      <div className="h-[750px]">
        <VirtualizedList
          ref={virtualListRef}
          className="!h-full"
          items={flatItems}
          totalCount={subscriptionCount}
          loading={loading}
          getItemKey={(item) =>
            item.type === "section" ? `section-${item.key}` : `sub-${getSubKey(item.data)}`
          }
          getItemHeight={getItemHeight}
          emptyStateTitle="Keine Abonnements gefunden"
          emptyStateText="Es wurden noch keine regelmäßigen Buchungen erkannt."
          emptyStateIllustration={<Repeat />}
          filterItems={
            [
              <Select
                key="freq"
                value={frequencyFilter}
                onValueChange={(v) => setFrequencyFilter(v as "ALL" | SubscriptionFrequency)}
              >
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue placeholder="Frequenz" />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>,
              <Button
                key="dismissed"
                type="button"
                variant="ghost"
                aria-pressed={includeDismissed}
                onClick={() => setIncludeDismissed(!includeDismissed)}
                className={
                  includeDismissed
                    ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
                    : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
                }
              >
                <EyeOff className="size-4" />
                Ausgeblendete anzeigen
              </Button>,
            ] as React.ReactNode[]
          }
          filterItem={(item, query) => {
            if (item.type === "section") return true;
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return (
              item.data.name.toLowerCase().includes(q) ||
              item.data.recipientName.toLowerCase().includes(q)
            );
          }}
          renderItem={(item: ListItem) => {
            if (item.type === "section") {
              return (
                <div className="flex items-center gap-2 border-b border-muted/60 bg-muted/30 px-4 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/80">
                    {item.label}
                  </h3>
                  <span className="text-[10px] text-muted-foreground/50">
                    ({item.count} {item.count === 1 ? "Abonnement" : "Abonnements"})
                  </span>
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/50">
                    Ø <span className="font-mono">{formatAmount(item.monthlyTotal)}</span> mtl
                  </span>
                </div>
              );
            }
            return (
              <SubscriptionRow
                subscription={item.data}
                isExpanded={expandedKey === getSubKey(item.data)}
                onToggle={() => toggleRow(item.data)}
                zahlungspartnerOptions={zahlungspartnerList}
                onLinkIdentity={handleLinkIdentity}
                onCreateAndLinkIdentity={handleCreateAndLinkIdentity}
                onDismissIdentity={handleDismissIdentity}
                onEndSubscription={handleEndSubscription}
                onRemoveIdentity={handleRemoveIdentity}
                onRestoreSubscription={handleRestoreSubscription}
                onReactivateSubscription={handleReactivateSubscription}
                onTransactionClick={(tx) =>
                  handleTransactionClick(tx.date, tx.amount < 0 ? "expense" : "income")
                }
              />
            );
          }}
        />
      </div>
      {chartSubscriptions.length > 0 && (
        <SubscriptionMonthlyChart
          data={chartData}
          highlight={chartHighlight}
          containerRef={chartRef}
        />
      )}
    </div>
  );
}
