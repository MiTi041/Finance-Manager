"use client";

import { RefreshCw } from "lucide-react";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

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
};

export function SyncButton({
  isSyncing,
  syncStatusText,
  cacheAgeText,
  syncStatusRows,
  refreshFinanceData,
}: SyncButtonProps) {
  const hasRows = !isSyncing && (syncStatusRows?.length ?? 0) > 0;

  return (
    <SidebarMenuItem className="group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
      <SidebarMenuButton
        onClick={refreshFinanceData}
        disabled={isSyncing}
        tooltip={`Daten aktualisieren (${cacheAgeText})`}
        className={`${
          hasRows ? "h-auto min-h-14 items-start" : "h-12 items-center"
        } flex justify-start gap-3 rounded-md transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:p-0 ${
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
    </SidebarMenuItem>
  );
}
