import * as React from "react";
import { FileText, Gauge, Repeat, ScanSearch } from "lucide-react";

import { normalizeIban } from "@/lib/iban";
import { buildAccountOptions, resolveAccountSelection } from "@/lib/utils/accounts";
import { NavMain } from "@/components/nav-main";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { fetchLatestDbTransaction } from "@/lib/transactions";
import { fetchBankCredentials, type StoredBankCredentials } from "@/lib/bank/credentials";
import {
  FINTS_SYNC_REQUEST_EVENT,
  FINTS_SYNC_STATUS_EVENT,
  type FintsSyncStatusDetail,
} from "@/lib/sync-events";
import { UpdateBanner } from "@/components/update-banner";
import { readActiveAccountIban, writeActiveAccountIban } from "@/lib/bank/active-storage";
import { BankSelector } from "./bank-selector";
import { SidebarFooterContent } from "./sidebar-footer-content";

const navData = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: Gauge,
    },
    {
      title: "Transaktionen",
      url: "/transactions",
      icon: FileText,
    },
    {
      title: "Abonnements",
      url: "/subscriptions",
      icon: Repeat,
    },
    {
      title: "Analyse",
      url: "/analytics",
      icon: ScanSearch,
    },
  ],
};

function parseLatestTimestamp(value: unknown): Date | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const isoDate = new Date(value);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate;
  }

  const parts = value.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [day, month, year] = parts;
  const germanDate = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(germanDate.getTime()) ? null : germanDate;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [cacheAgeText, setCacheAgeText] = React.useState<string>("Kein Cache");
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncStatusText, setSyncStatusText] = React.useState<string>("");
  const [linkedBanks, setLinkedBanks] = React.useState<StoredBankCredentials[]>([]);
  const [activeAccountIban, setActiveAccountIban] = React.useState<string>(() => readActiveAccountIban());

  const accountOptions = React.useMemo(() => buildAccountOptions(linkedBanks), [linkedBanks]);

  const resolveSelection = React.useCallback(
    (selection: string) => resolveAccountSelection(selection, accountOptions, linkedBanks),
    [accountOptions, linkedBanks],
  );

  const hasRestoredSelection = React.useRef(false);

  React.useEffect(() => {
    if (accountOptions.length === 0 || hasRestoredSelection.current) return;
    hasRestoredSelection.current = true;

    const storedSelection = readActiveAccountIban();
    const resolved = resolveSelection(storedSelection);
    setActiveAccountIban(resolved);
    writeActiveAccountIban(resolved);
    window.dispatchEvent(
      new CustomEvent("finance-bank-selection-change", {
        detail: { accountIban: resolved },
      }),
    );
  }, [accountOptions, resolveSelection]);

  const setActiveSelection = React.useCallback((accountIban: string) => {
    setActiveAccountIban(accountIban);
    writeActiveAccountIban(accountIban);
    window.dispatchEvent(
      new CustomEvent("finance-bank-selection-change", {
        detail: { accountIban },
      }),
    );
  }, []);

  const updateCacheAge = React.useCallback(async () => {
    // prefer client-side cache timestamps (localStorage), fallback to DB
    let newest = 0;

    try {
      const financeRaw = window.localStorage.getItem("financeDataCache");
      if (financeRaw) {
        const parsed = JSON.parse(financeRaw);
        const cand = Number(parsed?.cachedAt ?? parsed?.cached_at ?? parsed?.cachedAtMs);
        if (Number.isFinite(cand)) newest = Math.max(newest, cand);
      }
    } catch (e) {
      /* ignore parse errors */
    }

    try {
      const syncRaw = window.localStorage.getItem("fintsSyncCache");
      if (syncRaw) {
        const parsed = JSON.parse(syncRaw);
        const cand = Number(
          parsed?.syncedAt ?? parsed?.synced_at ?? parsed?.syncedAtMs ?? parsed?.lastSynced,
        );
        if (Number.isFinite(cand)) newest = Math.max(newest, cand);
      }
    } catch (e) {
      /* ignore parse errors */
    }

    if (!newest) {
      // fallback: use latest DB transaction timestamp
      const latest = await fetchLatestDbTransaction().catch(() => null);
      const latestValue = latest?.created_at ?? latest?.valutadatum ?? latest?.buchungstag;
      const latestDate = parseLatestTimestamp(latestValue);
      if (latestDate) newest = latestDate.getTime();
    }

    if (!newest) {
      setCacheAgeText("Kein Cache");
      return;
    }

    const diffMs = Date.now() - newest;
    const minutes = Math.floor(diffMs / 60000);

    if (minutes < 1) {
      setCacheAgeText("Gerade aktualisiert");
      return;
    }
    if (minutes < 60) {
      setCacheAgeText(`Vor ${minutes} Min.`);
      return;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      setCacheAgeText(`Vor ${hours} Std.`);
      return;
    }
    setCacheAgeText(`Vor ${Math.floor(hours / 24)} Tagen`);
  }, []);

  React.useEffect(() => {
    void updateCacheAge();
    void fetchBankCredentials()
      .then((banks) => {
        setLinkedBanks(banks);
      })
      .catch(() => {
        setLinkedBanks([]);
        setActiveAccountIban("all");
      });

    const interval = window.setInterval(() => {
      void updateCacheAge();
    }, 30000);
    const handleRefresh = () => {
      void updateCacheAge();
    };

    const onSyncStatusChange = (event: Event) => {
      const customEvent = event as CustomEvent<FintsSyncStatusDetail>;
      setIsSyncing(Boolean(customEvent.detail?.running));
      setSyncStatusText(customEvent.detail?.message ?? "");
    };

    const onBankCredentialsChanged = () => {
      void fetchBankCredentials({ forceRefresh: true })
        .then((banks) => {
          setLinkedBanks(banks);
          const localOptions = buildAccountOptions(banks);
          const storedSelection = readActiveAccountIban();
          const resolvedSelection = resolveAccountSelection(storedSelection, localOptions, banks);
          setActiveAccountIban(resolvedSelection);
          writeActiveAccountIban(resolvedSelection);
          window.dispatchEvent(
            new CustomEvent("finance-bank-selection-change", {
              detail: { accountIban: resolvedSelection },
            }),
          );
        })
        .catch(() => {
          setLinkedBanks([]);
          setActiveAccountIban("all");
        });
    };

    window.addEventListener("finance-data-refresh", handleRefresh);
    window.addEventListener(FINTS_SYNC_STATUS_EVENT, onSyncStatusChange);
    window.addEventListener("finance-bank-credentials-changed", onBankCredentialsChanged);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("finance-data-refresh", handleRefresh);
      window.removeEventListener(FINTS_SYNC_STATUS_EVENT, onSyncStatusChange);
      window.removeEventListener("finance-bank-credentials-changed", onBankCredentialsChanged);
    };
  }, [updateCacheAge]);

  const refreshFinanceData = () => {
    if (isSyncing) return;
    window.dispatchEvent(new CustomEvent(FINTS_SYNC_REQUEST_EVENT));
  };

  return (
    <Sidebar className="border-r border-border/50" collapsible="icon" {...props}>
      <SidebarHeader className="justify-center p-0">
        <BankSelector
          activeAccountIban={activeAccountIban}
          accountOptions={accountOptions}
          setActiveSelection={setActiveSelection}
        />
      </SidebarHeader>

      <Separator className="opacity-50" />

      <SidebarContent className="px-2 py-3 group-data-[collapsible=icon]:px-0">
        <div className="group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center [&_ul]:group-data-[collapsible=icon]:w-full [&_ul]:group-data-[collapsible=icon]:flex [&_ul]:group-data-[collapsible=icon]:flex-col [&_ul]:group-data-[collapsible=icon]:items-center [&_li]:group-data-[collapsible=icon]:w-full [&_li]:group-data-[collapsible=icon]:flex [&_li]:group-data-[collapsible=icon]:justify-center [&_a]:group-data-[collapsible=icon]:justify-center [&_button]:group-data-[collapsible=icon]:justify-center [&_button]:group-data-[collapsible=icon]:w-9 [&_a]:group-data-[collapsible=icon]:w-9 [&_button]:group-data-[collapsible=icon]:p-0 [&_a]:group-data-[collapsible=icon]:p-0">
          <NavMain items={navData.navMain} />
        </div>
      </SidebarContent>

      <Separator className="opacity-50" />

      <SidebarFooter className="p-2 gap-1.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2">
        <UpdateBanner />
        <SidebarFooterContent
          isSyncing={isSyncing}
          syncStatusText={syncStatusText}
          cacheAgeText={cacheAgeText}
          refreshFinanceData={refreshFinanceData}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
