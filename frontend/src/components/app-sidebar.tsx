"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import {
  ChevronsUpDown,
  FileText,
  Gauge,
  Landmark,
  RefreshCw,
  Settings,
} from "lucide-react";

import { BankLogo } from "@/components/bank-logo";
import { NavMain } from "@/components/nav-main";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { fetchLatestDbTransaction } from "@/lib/db";
import {
  fetchBankCredentials,
  type StoredBankCredentials,
} from "../lib/bank-credentials";
import {
  FINTS_SYNC_REQUEST_EVENT,
  FINTS_SYNC_STATUS_EVENT,
  type FintsSyncStatusDetail,
} from "@/lib/sync-events";
import { ModeToggle } from "./dark-mode-toggle";
import { UpdateBanner } from "./update-banner";
import { cn } from "@/lib/utils";
import { getSelectedBank } from "@/lib/selected-bank";

const ACTIVE_BANK_STORAGE_KEY = "finance.sidebar.active-account-iban.v1";
const LEGACY_ACTIVE_BANK_STORAGE_KEY = "finance.sidebar.active-bank-scope.v1";

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

function normalizeIban(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, "").toUpperCase();
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [cacheAgeText, setCacheAgeText] = React.useState<string>("Kein Cache");
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncStatusText, setSyncStatusText] = React.useState<string>("");
  const [linkedBanks, setLinkedBanks] = React.useState<StoredBankCredentials[]>(
    [],
  );
  const [activeAccountIban, setActiveAccountIban] = React.useState<string>(
    () => {
      if (typeof window === "undefined") return "all";
      return (
        window.localStorage.getItem(ACTIVE_BANK_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_ACTIVE_BANK_STORAGE_KEY) ??
        "all"
      );
    },
  );

  const accountOptions = React.useMemo(() => {
    const items: Array<{
      accountIban: string;
      accountName: string;
      bankName: string;
      bankLogo?: string;
      username?: string;
      scope: string;
    }> = [];

    linkedBanks.forEach((bank) => {
      const accounts = (bank.accounts ?? []).filter((account) =>
        Boolean(account?.iban),
      );

      if (accounts.length > 0) {
        accounts.forEach((account) => {
          items.push({
            accountIban: normalizeIban(account.iban),
            accountName:
              account.account_name ||
              bank.account_name ||
              bank.bank_name ||
              bank.username ||
              "Konto",
            bankName: bank.bank_name || bank.bank_key,
            bankLogo: bank.bank_logo || undefined,
            username: bank.username,
            scope: bank.scope,
          });
        });
        return;
      }

      const fallbackIban = normalizeIban(bank.account_iban);
      if (fallbackIban) {
        items.push({
          accountIban: fallbackIban,
          accountName:
            bank.account_name || bank.bank_name || bank.username || "Konto",
          bankName: bank.bank_name || bank.bank_key,
          bankLogo: bank.bank_logo || undefined,
          username: bank.username,
          scope: bank.scope,
        });
      }
    });

    return items;
  }, [linkedBanks]);

  const resolveSelection = React.useCallback(
    (selection: string) => {
      if (selection === "all") {
        return "all";
      }

      const byIban = accountOptions.find(
        (item) => item.accountIban === normalizeIban(selection),
      );
      if (byIban) {
        return byIban.accountIban;
      }

      const legacyBank = linkedBanks.find((bank) => bank.scope === selection);
      if (legacyBank) {
        const legacyFallback =
          legacyBank.accounts?.find((account) => normalizeIban(account.iban))
            ?.iban ?? legacyBank.account_iban;
        if (legacyFallback) {
          return normalizeIban(legacyFallback);
        }
      }

      return "all";
    },
    [accountOptions, linkedBanks],
  );

  const hasRestoredSelection = React.useRef(false);

  React.useEffect(() => {
    if (accountOptions.length === 0 || hasRestoredSelection.current) return;
    hasRestoredSelection.current = true;

    const storedSelection =
      window.localStorage.getItem(ACTIVE_BANK_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_ACTIVE_BANK_STORAGE_KEY) ??
      "all";

    const resolved = resolveSelection(storedSelection);
    setActiveAccountIban(resolved);
    window.localStorage.setItem(ACTIVE_BANK_STORAGE_KEY, resolved);
  }, [accountOptions, resolveSelection]);

  const activeAccount = React.useMemo(
    () =>
      activeAccountIban === "all"
        ? null
        : (accountOptions.find(
            (item) => item.accountIban === activeAccountIban,
          ) ?? null),
    [accountOptions, activeAccountIban],
  );

  const activeBankLabel =
    activeAccountIban === "all"
      ? "Alle Konten"
      : activeAccount?.accountName ||
        activeAccount?.bankName ||
        "Verknüpftes Konto";

  const activeBankSubtitle =
    activeAccountIban === "all"
      ? `${accountOptions.length} verknüpfte Konten`
      : `${activeAccount?.bankName || "Bank"} · ${activeAccount?.accountIban || ""}`;

  const activeBankLogo = activeAccount?.bankLogo || undefined;

  const setActiveSelection = React.useCallback((accountIban: string) => {
    setActiveAccountIban(accountIban);
    window.localStorage.setItem(ACTIVE_BANK_STORAGE_KEY, accountIban);
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
        const cand = Number(
          parsed?.cachedAt ?? parsed?.cached_at ?? parsed?.cachedAtMs,
        );
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
          parsed?.syncedAt ??
            parsed?.synced_at ??
            parsed?.syncedAtMs ??
            parsed?.lastSynced,
        );
        if (Number.isFinite(cand)) newest = Math.max(newest, cand);
      }
    } catch (e) {
      /* ignore parse errors */
    }

    if (!newest) {
      // fallback: use latest DB transaction timestamp
      const latest = await fetchLatestDbTransaction().catch(() => null);
      const latestValue =
        latest?.created_at ?? latest?.valutadatum ?? latest?.buchungstag;
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
          const storedSelection =
            window.localStorage.getItem(ACTIVE_BANK_STORAGE_KEY) ??
            window.localStorage.getItem(LEGACY_ACTIVE_BANK_STORAGE_KEY) ??
            "all";
          const resolvedSelection = resolveSelection(storedSelection);
          setActiveAccountIban(resolvedSelection);
          window.localStorage.setItem(
            ACTIVE_BANK_STORAGE_KEY,
            resolvedSelection,
          );
        })
        .catch(() => {
          setLinkedBanks([]);
          setActiveAccountIban("all");
        });
    };

    window.addEventListener("finance-data-refresh", handleRefresh);
    window.addEventListener(FINTS_SYNC_STATUS_EVENT, onSyncStatusChange);
    window.addEventListener(
      "finance-bank-credentials-changed",
      onBankCredentialsChanged,
    );

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("finance-data-refresh", handleRefresh);
      window.removeEventListener(FINTS_SYNC_STATUS_EVENT, onSyncStatusChange);
      window.removeEventListener(
        "finance-bank-credentials-changed",
        onBankCredentialsChanged,
      );
    };
  }, [updateCacheAge]);

  const refreshFinanceData = () => {
    if (isSyncing) return;
    window.dispatchEvent(new CustomEvent(FINTS_SYNC_REQUEST_EVENT));
  };

  return (
    <Sidebar
      className="border-r border-border/50"
      collapsible="icon"
      {...props}
    >
      <SidebarHeader className="justify-center p-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="cursor-pointer flex w-full items-center justify-between gap-3  bg-sidebar-accent/35 px-3 py-2.5 text-left shadow-sm transition hover:bg-sidebar-accent/55 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:bg-transparent"
            >
              <div
                className={cn(
                  "flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:justify-center",
                )}
              >
                {activeAccountIban === "all" ? (
                  <div className="flex size-12 group-data-[collapsible=icon]:size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground border">
                    <Landmark className="size-4" />
                  </div>
                ) : (
                  <BankLogo
                    src={activeBankLogo}
                    alt={
                      activeAccount?.bankName ??
                      activeAccount?.accountName ??
                      "Bank"
                    }
                    sizeClassName="size-12 group-data-[collapsible=icon]:size-8"
                    className="p-1"
                    imgNoPadding={false}
                    backgroundClassName="bg-muted/70"
                  />
                )}
                <div className="flex min-w-0 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-semibold tracking-tight">
                    {activeBankLabel}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {activeBankSubtitle || "Alle Konten"}
                  </span>
                </div>
              </div>

              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-72 rounded-lg"
            sideOffset={8}
            align="start"
          >
            <DropdownMenuLabel>Verknüpfte Konten</DropdownMenuLabel>
            <DropdownMenuSeparator />

            <div className="space-y-1">
              <DropdownMenuItem
                onSelect={() => setActiveSelection("all")}
                className={activeAccountIban === "all" ? "bg-accent" : ""}
              >
                <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground border">
                  <Landmark className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">Alle</div>
                  <div className="truncate text-xs text-muted-foreground">
                    Alle verknüpften Konten anzeigen
                  </div>
                </div>
              </DropdownMenuItem>

              {accountOptions.length === 0 ? (
                <DropdownMenuItem disabled>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      Keine Konten verbunden
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      Verknüpfe zuerst ein Konto in den Einstellungen.
                    </div>
                  </div>
                </DropdownMenuItem>
              ) : (
                accountOptions.map((account) => (
                  <DropdownMenuItem
                    key={account.accountIban}
                    onSelect={() => setActiveSelection(account.accountIban)}
                    className={
                      activeAccountIban === account.accountIban
                        ? "bg-accent"
                        : ""
                    }
                  >
                    <BankLogo
                      src={account.bankLogo || undefined}
                      alt={account.accountName || account.bankName || "Bank"}
                      sizeClassName="size-12"
                      className="p-1"
                      backgroundClassName="bg-muted/70"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {account.accountName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {account.bankName} · {account.accountIban}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link
                to="/settings?tab=bank-access"
                className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full"
              >
                <Settings className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Konten verwalten
                </span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem className="group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <SidebarMenuButton
              onClick={refreshFinanceData}
              disabled={isSyncing}
              tooltip={`Daten aktualisieren (${cacheAgeText})`}
              className={`h-12 flex items-center justify-start gap-3 rounded-md transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:p-0 ${
                isSyncing
                  ? "bg-primary/5 text-primary hover:bg-primary/10"
                  : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-center size-4 shrink-0">
                <RefreshCw
                  className={`size-4 transition-transform duration-700 ${
                    isSyncing ? "animate-spin text-primary" : ""
                  }`}
                />
              </div>

              <div className="flex flex-col items-start justify-center min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium truncate">
                  {isSyncing ? "Synchronisiere..." : "Daten aktualisieren"}
                </span>

                {isSyncing ? (
                  <span className="text-[10px] text-muted-foreground font-normal tracking-wide tabular-nums mt-0.5 truncate max-w-[10rem]">
                    {syncStatusText || "Bitte warten..."}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-normal tracking-wide tabular-nums mt-0.5">
                    {cacheAgeText}
                  </span>
                )}
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem className="group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <SidebarMenuButton
              tooltip="Einstellungen"
              asChild
              className="text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:p-0"
            >
              <Link
                to="/settings"
                className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full"
              >
                <Settings className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Einstellungen
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center justify-between gap-2 pt-1.5 mt-1 px-1 border-t border-border/30 group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:border-t-0 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center">
          <span className="text-xs text-muted-foreground font-medium pl-1 group-data-[collapsible=icon]:hidden">
            Design wechseln
          </span>
          <div className="group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <ModeToggle />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
