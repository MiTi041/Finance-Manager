"use client";

import { Loader2, Tags, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "@/components/category-combobox";
import { Checkbox } from "@/components/ui/checkbox";

import {
  type TransactionCategoryOption,
  UNASSIGNED_CATEGORY_VALUE,
} from "./transactions.utils";

type BatchActionsBarProps = {
  selectedCount: number;
  isAllVisibleSelected: boolean;
  onSelectAll: () => void;
  batchCategoryId: string;
  onBatchCategoryChange: (value: string) => void;
  categoryOptions: TransactionCategoryOption[];
  onBatchCategorize: () => void;
  applyingBatchCategory: boolean;
  onBatchDelete: () => void;
  onClearSelection: () => void;
};

export function BatchActionsBar({
  selectedCount,
  isAllVisibleSelected,
  onSelectAll,
  batchCategoryId,
  onBatchCategoryChange,
  categoryOptions,
  onBatchCategorize,
  applyingBatchCategory,
  onBatchDelete,
  onClearSelection,
}: BatchActionsBarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-sm font-semibold text-foreground">
          {selectedCount}
        </span>
        <span className="text-xs text-muted-foreground">ausgewählt</span>
      </div>
      <span className="h-5 w-px bg-border/60" />
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          Alle
        </span>
        <Checkbox
          checked={isAllVisibleSelected}
          onCheckedChange={() => onSelectAll()}
          aria-label="Alle sichtbaren auswählen"
        />
      </div>
      <span className="h-5 w-px bg-border/60" />
      <div className="flex items-center gap-1.5">
        <CategoryCombobox
          value={batchCategoryId}
          onValueChange={onBatchCategoryChange}
          options={categoryOptions}
          showNoneOption
          noneValue={UNASSIGNED_CATEGORY_VALUE}
          placeholder="Kategorie …"
          height={10}
          className="w-44 text-xs shadow-none"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!batchCategoryId || applyingBatchCategory}
          onClick={() => onBatchCategorize()}
          height={10}
          className="text-xs"
        >
          {applyingBatchCategory ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Tags className="size-3.5" />
          )}
          Zuweisen
        </Button>
      </div>
      <span className="h-5 w-px bg-border/60" />
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => onBatchDelete()}
        height={10}
        className="text-xs"
      >
        <Trash2 className="size-3.5" />
        Löschen
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onClearSelection}
        height={10}
        className="!w-8 p-0"
        title="Auswahl aufheben"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
