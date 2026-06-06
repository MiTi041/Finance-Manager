"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/dark-mode-toggle";
import { SyncButton } from "./sync-button";

export type SidebarFooterContentProps = {
  isSyncing: boolean;
  syncStatusText: string;
  cacheAgeText: string;
  refreshFinanceData: () => void;
};

export function SidebarFooterContent({
  isSyncing,
  syncStatusText,
  cacheAgeText,
  refreshFinanceData,
}: SidebarFooterContentProps) {
  return (
    <>
      <SidebarMenu className="group-data-[collapsible=icon]:items-center">
        <SyncButton
          isSyncing={isSyncing}
          syncStatusText={syncStatusText}
          cacheAgeText={cacheAgeText}
          refreshFinanceData={refreshFinanceData}
        />

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
    </>
  );
}
