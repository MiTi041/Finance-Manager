"use client";

import { RefreshCw } from "lucide-react";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export type SyncButtonProps = {
  isSyncing: boolean;
  syncStatusText: string;
  cacheAgeText: string;
  refreshFinanceData: () => void;
};

export function SyncButton({
  isSyncing,
  syncStatusText,
  cacheAgeText,
  refreshFinanceData,
}: SyncButtonProps) {
  return (
    <SidebarMenuItem className="group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
      <SidebarMenuButton
        onClick={refreshFinanceData}
        disabled={isSyncing}
        tooltip={`Daten aktualisieren (${cacheAgeText})`}
        className={`h-12 flex items-center justify-start gap-3 rounded-md transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:p-0 ${
          isSyncing
            ? "bg-primary/10 text-primary hover:bg-primary/10"
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
            <span
              className={`text-[10px] font-normal tracking-wide tabular-nums mt-0.5 truncate max-w-[10rem] text-muted-foreground`}
            >
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
  );
}
