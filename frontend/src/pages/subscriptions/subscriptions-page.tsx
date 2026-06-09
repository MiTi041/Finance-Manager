import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleX, Repeat } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VirtualizedList } from "@/components/virtualized-list";
import {
  createSubscriptionIdentity,
  deleteSubscriptionIdentity,
  listSubscriptionIdentities,
  useSubscriptions,
  type Subscription,
  type SubscriptionFrequency,
} from "@/pages/subscriptions/hooks/use-subscriptions";
import { createZahlungspartner, fetchZahlungspartnerReferenceData } from "@/lib/zahlungspartner";
import type { ZahlungspartnerRecord } from "@/lib/zahlungspartner";
import { toast } from "sonner";

import { SubscriptionRow } from "./components/subscription-row";

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
  const { loading, error, grouped, reload, removeSubscription } = useSubscriptions();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [zahlungspartnerList, setZahlungspartnerList] = useState<ZahlungspartnerRecord[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState<"ALL" | SubscriptionFrequency>("ALL");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

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
      <VirtualizedList
        items={flatItems}
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
            />
          );
        }}
      />
    </div>
  );
}
