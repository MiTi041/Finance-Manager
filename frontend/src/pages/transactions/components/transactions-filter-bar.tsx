import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "@/components/category-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterX, SearchX, Landmark, ArrowRightLeft } from "lucide-react";

import { type TransactionCategoryOption } from "@/lib/utils/categories";

type TransactionsFilterBarProps = {
  onlyUnassigned: boolean;
  onlyUnknownIban: boolean;
  showDeletedBanks: boolean;
  hideMigrated: boolean;
  unassignedCount: number;
  unknownIbanCount: number;
  deletedBankCount: number;
  migratedCount: number;
  amountFilter: string;
  categoryFilter: string;
  categoryOptions: TransactionCategoryOption[];
  onToggleOnlyUnassigned: () => void;
  onToggleOnlyUnknownIban: () => void;
  onToggleShowDeletedBanks: () => void;
  onToggleHideMigrated: () => void;
  onAmountFilterChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
};

export function TransactionsFilterBar({
  onlyUnassigned,
  onlyUnknownIban,
  showDeletedBanks,
  hideMigrated,
  unassignedCount,
  unknownIbanCount,
  deletedBankCount,
  migratedCount,
  amountFilter,
  categoryFilter,
  categoryOptions,
  onToggleOnlyUnassigned,
  onToggleOnlyUnknownIban,
  onToggleShowDeletedBanks,
  onToggleHideMigrated,
  onAmountFilterChange,
  onCategoryFilterChange,
}: TransactionsFilterBarProps) {
  return (
    <>
      {
        <Button
          type="button"
          variant="ghost"
          aria-pressed={onlyUnassigned}
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
      }

      {
        <Button
          type="button"
          variant="ghost"
          aria-pressed={onlyUnknownIban}
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
      }

      {(deletedBankCount > 0 || showDeletedBanks) && (
        <Button
          type="button"
          variant="ghost"
          aria-pressed={showDeletedBanks}
          className={
            showDeletedBanks
              ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
              : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
          }
          onClick={onToggleShowDeletedBanks}
        >
          <Landmark className="size-4" />
          <span>Transaktionen von gelöschten Bankzugängen anzeigen</span>
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

      {(migratedCount > 0 || hideMigrated) && (
        <Button
          type="button"
          variant="ghost"
          aria-pressed={hideMigrated}
          className={
            hideMigrated
              ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
              : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
          }
          onClick={onToggleHideMigrated}
        >
          <ArrowRightLeft className="size-4" />
          <span>Migrierte Transaktionen ausblenden</span>
          <span
            className={
              hideMigrated
                ? "hidden shrink-0 rounded-full bg-amber-500/20 px-1.5 py-px text-[10px] font-medium text-amber-200 sm:inline dark:text-amber-300"
                : "hidden shrink-0 rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-700 sm:inline dark:text-amber-400"
            }
          >
            {migratedCount}
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
