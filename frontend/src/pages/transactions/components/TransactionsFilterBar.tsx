import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "@/components/category-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterX, SearchX, Landmark } from "lucide-react";

import { type TransactionCategoryOption } from "./transactions.utils";

type TransactionsFilterBarProps = {
  onlyUnassigned: boolean;
  onlyUnknownIban: boolean;
  showDeletedBanks: boolean;
  unassignedCount: number;
  unknownIbanCount: number;
  deletedBankCount: number;
  amountFilter: string;
  categoryFilter: string;
  categoryOptions: TransactionCategoryOption[];
  onToggleOnlyUnassigned: () => void;
  onToggleOnlyUnknownIban: () => void;
  onToggleShowDeletedBanks: () => void;
  onAmountFilterChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
};

export function TransactionsFilterBar({
  onlyUnassigned,
  onlyUnknownIban,
  showDeletedBanks,
  unassignedCount,
  unknownIbanCount,
  deletedBankCount,
  amountFilter,
  categoryFilter,
  categoryOptions,
  onToggleOnlyUnassigned,
  onToggleOnlyUnknownIban,
  onToggleShowDeletedBanks,
  onAmountFilterChange,
  onCategoryFilterChange,
}: TransactionsFilterBarProps) {
  return (
    <>
      {unassignedCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          className={
            onlyUnassigned
              ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
              : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
          }
          onClick={onToggleOnlyUnassigned}
        >
          <FilterX className="size-4" />
          <span>Nur Transaktionen ohne Kategorie anzeigen</span>
          <span
            className={
              onlyUnassigned
                ? "hidden shrink-0 rounded-full bg-background/20 px-1.5 py-px text-[10px] font-medium text-background sm:inline"
                : "hidden shrink-0 rounded-full bg-muted-foreground/10 px-1.5 py-px text-[10px] font-medium text-muted-foreground sm:inline"
            }
          >
            {unassignedCount}
          </span>
        </Button>
      )}

      {unknownIbanCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          className={
            onlyUnknownIban
              ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
              : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
          }
          onClick={onToggleOnlyUnknownIban}
        >
          <SearchX className="size-4" />
          <span>Nur Transaktionen mit unbekannter IBAN anzeigen</span>
          <span
            className={
              onlyUnknownIban
                ? "hidden shrink-0 rounded-full bg-background/20 px-1.5 py-px text-[10px] font-medium text-background sm:inline"
                : "hidden shrink-0 rounded-full bg-muted-foreground/10 px-1.5 py-px text-[10px] font-medium text-muted-foreground sm:inline"
            }
          >
            {unknownIbanCount}
          </span>
        </Button>
      )}

      {deletedBankCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          className={
            showDeletedBanks
              ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
              : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
          }
          onClick={onToggleShowDeletedBanks}
        >
          <Landmark className="size-4" />
          <span>Gelöschte Bankzugänge anzeigen</span>
          <span
            className={
              showDeletedBanks
                ? "hidden shrink-0 rounded-full bg-red-500/20 px-1.5 py-px text-[10px] font-medium text-red-300 sm:inline dark:text-red-400"
                : "hidden shrink-0 rounded-full bg-red-500/10 px-1.5 py-px text-[10px] font-medium text-red-600 sm:inline dark:text-red-400"
            }
          >
            {deletedBankCount}
          </span>
        </Button>
      )}

      <Select value={amountFilter} onValueChange={onAmountFilterChange}>
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue placeholder="Betrag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Beträge</SelectItem>
          <SelectItem value="income">Einnahmen</SelectItem>
          <SelectItem value="expense">Ausgaben</SelectItem>
        </SelectContent>
      </Select>

      <CategoryCombobox
        value={categoryFilter}
        onValueChange={onCategoryFilterChange}
        options={categoryOptions}
        placeholder="Kategorie"
        className="h-9 w-[220px]"
      />
    </>
  );
}
