import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleX, EyeOff, Repeat, Wallet } from "lucide-react";

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
  listSubscriptionIdentities,
  updateSubscriptionIdentity,
  useSubscriptions,
  type Subscription,
  type SubscriptionFrequency,
} from "@/pages/subscriptions/hooks/use-subscriptions";
import { createZahlungspartner, fetchZahlungspartnerReferenceData } from "@/lib/zahlungspartner";
import type { ZahlungspartnerRecord } from "@/lib/zahlungspartner";
import { StatCard } from "@/pages/dashboard/components/stat-card";
import { toast } from "sonner";

import { SubscriptionRow } from "./components/subscription-row";
import { SubscriptionMonthlyChart } from "./components/subscription-monthly-chart";

const FREQUENCY_ORDER: SubscriptionFrequency[] = ["MONTHLY", "SEMI_ANNUAL", "ANNUAL"];

const FREQUENCY_TITLES: Record<SubscriptionFrequency, string> = {
  MONTHLY: "Monatliche Abonnements",
  SEMI_ANNUAL: "Halbjährliche Abonnements",
  ANNUAL: "Jährliche Abonnements",
};

type SectionItem = {
  type: "section";
  frequency: SubscriptionFrequency;
  label: string;
  count: number;
};

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

type SortKey = "amount" | "nextDate";

export default function SubscriptionsPage() {
  const { loading, error, grouped, subscriptions, reload, removeSubscription, includeDismissed, setIncludeDismissed } = useSubscriptions();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [zahlungspartnerList, setZahlungspartnerList] = useState<ZahlungspartnerRecord[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState<"ALL" | SubscriptionFrequency>("ALL");
  const [sortKey, setSortKey] = useState<SortKey | null>("nextDate");
  const [sortAsc, setSortAsc] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const virtualListRef = useRef<VirtualizedListRef>(null);
  const highlightRef = useRef(false);

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
        toast.success("Abonnement ausgeblendet");
      } catch (err) {
        await reload();
        toast.error(
          err instanceof Error ? err.message : "Abonnement konnte nicht ausgeblendet werden",
        );
      }
    },
    [reload, removeSubscription],
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
        toast.success("Abonnement wiederhergestellt");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Abonnement konnte nicht wiederhergestellt werden");
      }
    },
    [reload],
  );

  const flatItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];

    for (const freq of FREQUENCY_ORDER) {
      if (frequencyFilter !== "ALL" && freq !== frequencyFilter) continue;
      const group = grouped[freq];
      if (group.length === 0) continue;

      const sorted = sortKey
        ? [...group].sort((a, b) => {
            let cmp: number;
            if (sortKey === "amount") {
              cmp = a.amount - b.amount;
            } else {
              cmp = new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime();
            }
            return sortAsc ? cmp : -cmp;
          })
        : group;

      items.push({
        type: "section",
        frequency: freq,
        label: FREQUENCY_TITLES[freq],
        count: sorted.length,
      });
      for (const sub of sorted) {
        items.push({ type: "subscription", data: sub });
      }
    }
    return items;
  }, [grouped, frequencyFilter, sortKey, sortAsc]);

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

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortAsc(true);
    } else if (sortAsc) {
      setSortAsc(false);
    } else {
      setSortKey(null);
      setSortAsc(true);
    }
  };

  const monthlyTotal = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const isDateThisMonth = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    };

    const isDueThisMonth = (s: Subscription) =>
      isDateThisMonth(s.nextDate) || isDateThisMonth(s.lastDate);

    const monthlyDue = grouped.MONTHLY.filter(isDueThisMonth);
    const semiAnnualDue = grouped.SEMI_ANNUAL.filter(isDueThisMonth);
    const annualDue = grouped.ANNUAL.filter(isDueThisMonth);

    const monthlyTotal = monthlyDue.reduce((sum, s) => sum + s.effectiveAmount, 0);
    const semiAnnualMonthly = semiAnnualDue.reduce((sum, s) => sum + s.effectiveAmount / 6, 0);
    const annualMonthly = annualDue.reduce((sum, s) => sum + s.effectiveAmount / 12, 0);

    return monthlyTotal + semiAnnualMonthly + annualMonthly;
  }, [grouped]);

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

  if (!loading && !hasSubscriptions) {
    return (
      <EmptyState
        title="Keine Abonnements gefunden"
        text="Es wurden noch keine regelmäßigen Abbuchungen erkannt."
        illustration={<Repeat />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6">
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
      <div className="h-[750px]">
        <VirtualizedList
        ref={virtualListRef}
        className="!h-full"
        items={flatItems}
        totalCount={subscriptionCount}
        loading={loading}
        getItemKey={(item) =>
          item.type === "section" ? `section-${item.frequency}` : `sub-${getSubKey(item.data)}`
        }
        getItemHeight={getItemHeight}
        emptyStateTitle="Keine Abonnements gefunden"
        emptyStateText="Es wurden noch keine regelmäßigen Abbuchungen erkannt."
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
              className={includeDismissed
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
              onRemoveIdentity={handleRemoveIdentity}
              onRestoreSubscription={handleRestoreSubscription}
            />
          );
        }}
      />
      </div>
      {!loading && subscriptions.length > 0 && (
        <SubscriptionMonthlyChart subscriptions={subscriptions} />
      )}
    </div>
  );
}
