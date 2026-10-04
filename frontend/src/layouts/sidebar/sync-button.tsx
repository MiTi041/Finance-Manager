"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { BankLogo } from "@/components/bank-logo";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatRelativeAge } from "@/lib/utils/format";
import type { BankSyncOption } from "@/lib/utils/accounts";

export type SyncStatusRow = {
  label: string;
  text: string;
};

export type SyncButtonProps = {
  isSyncing: boolean;
  syncStatusText: string;
  cacheAgeText: string;
  syncStatusRows?: SyncStatusRow[];
  refreshFinanceData: () => void;
  bankOptions: BankSyncOption[];
  activeSyncScope: string | null;
  syncBank: (scope: string) => void;
};

export function SyncButton({
  isSyncing,
  syncStatusText,
  cacheAgeText,
  syncStatusRows,
  refreshFinanceData,
  bankOptions,
  activeSyncScope,
  syncBank,
}: SyncButtonProps) {
  const hasRows = !isSyncing && (syncStatusRows?.length ?? 0) > 0;
  const syncableBanks = bankOptions.filter((bank) => !bank.manual);
  // Bei nur einer Bank bringt die Einzelauswahl nichts.
  const showBankMenu = syncableBanks.length >= 2;

  const [menuOpen, setMenuOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openMenu = React.useCallback(() => {
    cancelClose();
    setMenuOpen(true);
  }, [cancelClose]);

  // Kurze Verzögerung, damit der Mauszeiger den Spalt zwischen Button und
  // Portaled-Content überqueren kann, ohne das Menü zuzuklappen.
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setMenuOpen(false), 120);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  return (
    <SidebarMenuItem
      className="group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
      onMouseEnter={showBankMenu ? openMenu : undefined}
      onMouseLeave={showBankMenu ? scheduleClose : undefined}
    >
      <div className="flex w-full items-stretch gap-1 group-data-[collapsible=icon]:justify-center">
        <SidebarMenuButton
          onClick={refreshFinanceData}
          disabled={isSyncing}
          tooltip={`Daten aktualisieren (${cacheAgeText})`}
          className={`${
            hasRows ? "h-auto min-h-14 items-start" : "h-12 items-center"
          } min-w-0 flex-1 justify-start gap-3 rounded-md transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:p-0 ${
            isSyncing
              ? "bg-primary/10 text-primary hover:bg-primary/10"
              : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <div
            className={`flex items-center justify-center size-4 shrink-0 ${
              hasRows ? "mt-[3px]" : ""
            }`}
          >
            <RefreshCw
              className={`size-4 transition-transform duration-700 ${
                isSyncing ? "animate-spin text-primary" : ""
              }`}
            />
          </div>

          <div className="flex flex-1 flex-col items-start min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-medium truncate w-full">
              {isSyncing ? "Synchronisiere..." : "Daten aktualisieren"}
            </span>

            {isSyncing ? (
              <span
                className={`text-[10px] font-normal tracking-wide tabular-nums mt-0.5 truncate max-w-full text-muted-foreground`}
              >
                {syncStatusText || "Bitte warten..."}
              </span>
            ) : syncStatusRows && syncStatusRows.length > 0 ? (
              <span className="mt-0.5 flex flex-col gap-0.5 min-w-0 w-full">
                {syncStatusRows.map((row) => (
                  <span
                    key={row.label}
                    className="flex w-full items-baseline gap-1 text-[10px] font-normal tracking-wide tabular-nums text-muted-foreground"
                    title={`${row.label}: ${row.text}`}
                  >
                    <span className="truncate font-medium min-w-0">{row.label}</span>
                    <span className="shrink-0">{row.text}</span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground font-normal tracking-wide tabular-nums mt-0.5">
                {cacheAgeText}
              </span>
            )}
          </div>
        </SidebarMenuButton>
      </div>

      {showBankMenu ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Einzelne Bank aktualisieren"
              className="pointer-events-none absolute right-2 top-2 size-px opacity-0"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={8}
            className="w-72"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuLabel>Bank aktualisieren</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {syncableBanks.map((bank) => {
              const running = activeSyncScope === bank.scope;
              return (
                <DropdownMenuItem
                  key={bank.scope}
                  disabled={isSyncing}
                  onSelect={(event) => {
                    // Menü offen lassen, um mehrere Banken nacheinander zu syncen.
                    event.preventDefault();
                    syncBank(bank.scope);
                  }}
                  className="gap-3"
                >
                  <BankLogo
                    src={bank.bankLogo}
                    srcDark={bank.bankLogoDark}
                    alt={bank.label}
                    sizeClassName="size-8"
                    imgPadding={bank.logoPadding}
                    backgroundClassName="bg-muted/70"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{bank.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {running
                        ? "Synchronisiere..."
                        : bank.lastSyncAt
                          ? formatRelativeAge(bank.lastSyncAt)
                          : "Nie synchronisiert"}
                    </div>
                  </div>
                  <RefreshCw
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground",
                      running && "animate-spin text-primary",
                    )}
                  />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </SidebarMenuItem>
  );
}
