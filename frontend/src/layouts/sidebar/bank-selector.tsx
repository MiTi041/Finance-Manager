"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronsUpDown, Landmark, Settings } from "lucide-react";

import { BankLogo } from "@/components/bank-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type AccountOption = {
  accountIban: string;
  accountName: string;
  bankName: string;
  bankLogo?: string;
  username?: string;
  scope: string;
};

type BankSelectorProps = {
  activeAccountIban: string;
  accountOptions: AccountOption[];
  setActiveSelection: (iban: string) => void;
};

export function BankSelector({
  activeAccountIban,
  accountOptions,
  setActiveSelection,
}: BankSelectorProps) {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="cursor-pointer flex w-full items-center justify-between gap-3  bg-sidebar-accent/35 px-3 py-2.5 text-left shadow-sm transition hover:bg-sidebar-accent/55 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:m-2"
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
  );
}
