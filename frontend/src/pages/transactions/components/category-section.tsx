import { type KeyboardEvent } from "react";
import { Check, Plus, Sparkles, Trash2, X } from "lucide-react";

import { CategoryCombobox } from "@/components/category-combobox";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount } from "@/lib/utils/format";
import { type TransactionCategoryOption, UNASSIGNED_CATEGORY_VALUE } from "@/lib/utils/categories";
import { cn } from "@/lib/utils";
import { type Transaction } from "@/types/transaction";

import { useSplits } from "../hooks/use-splits";

type CategorySectionProps = {
  transaction: Transaction;
  categoryOptions: TransactionCategoryOption[];
  currentCategoryId: number | null;
  predictedCategoryId: number | null;
  predictedSimilarity: number | null;
  categoryTriggerRef: (node: HTMLButtonElement | null) => void;
  onSaveCategory: (transactionId: number, categoryId: number | null) => void;
  onRowKeyDown: (event: KeyboardEvent<Element>, transactionId: number) => void;
  splits: ReturnType<typeof useSplits>;
};

export function CategorySection({
  transaction,
  categoryOptions,
  currentCategoryId,
  predictedCategoryId,
  predictedSimilarity,
  categoryTriggerRef,
  onSaveCategory,
  onRowKeyDown,
  splits,
}: CategorySectionProps) {
  const predictedSimilarityPercent = Math.round((predictedSimilarity ?? 0) * 100);

  return (
    <div className="space-y-3 px-5 py-4" onClick={(event) => event.stopPropagation()}>
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        {splits.hasSplits ? "Splits" : "Kategorie"}
      </p>

      {splits.hasSplits ? (
        <div className="space-y-1.5">
          {splits.splitDrafts!.map((split, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 transition-colors hover:bg-muted/50"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/10 text-[10px] font-medium text-muted-foreground/60 tabular-nums">
                {index + 1}
              </span>
              <div className="relative w-24 shrink-0">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/40">
                  €
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={Math.abs(split.betrag)}
                  onChange={(e) => splits.handleSplitAmountChange(index, Number(e.target.value))}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="h-10 w-full rounded-md border border-input bg-background pl-6 pr-2 text-xs tabular-nums text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
              <CategoryCombobox
                value={
                  split.kategorieId == null ? UNASSIGNED_CATEGORY_VALUE : String(split.kategorieId)
                }
                onValueChange={(value) => {
                  splits.handleSplitCategoryChange(
                    index,
                    value === UNASSIGNED_CATEGORY_VALUE ? null : Number(value),
                  );
                }}
                options={categoryOptions}
                showNoneOption
                noneValue={UNASSIGNED_CATEGORY_VALUE}
                placeholder="Kategorie"
                onKeyDown={(e) => e.stopPropagation()}
                className={
                  split.kategorieId == null
                    ? "h-10 flex-1 !border-orange-500/40 !bg-orange-500/10 hover:!bg-orange-700/10 text-xs text-orange-500 hover:!text-orange-500 shadow-none"
                    : "h-10 flex-1 text-xs shadow-none"
                }
              />
              <button
                type="button"
                onClick={() => splits.handleRemoveSplit(index)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/30 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  splits.splitAbsSum === 0
                    ? "bg-border/40"
                    : splits.splitMatchesTotal
                      ? "bg-green-500/30"
                      : "bg-destructive/30",
                )}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    splits.splitAbsSum === 0
                      ? "w-0"
                      : splits.splitMatchesTotal
                        ? "bg-green-500"
                        : "bg-destructive",
                  )}
                  style={{
                    width: `${Math.min((splits.splitAbsSum / splits.absTotal) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
            <span
              className={cn(
                "text-xs tabular-nums font-medium",
                splits.splitMatchesTotal
                  ? "text-green-600 dark:text-green-400"
                  : "text-destructive",
              )}
            >
              {formatAmount(splits.splitAbsSum, transaction.betrag.waehrung)}
              <span className="text-muted-foreground/40 mx-0.5">/</span>
              {formatAmount(splits.absTotal, transaction.betrag.waehrung)}
              {splits.splitMatchesTotal ? (
                <Check className="ml-1 inline size-3" />
              ) : (
                <span className="ml-1">✗</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={splits.handleAddSplit}
            >
              <Plus className="size-3" />
              Split
            </Button>
            {splits.splitsChanged && splits.splitMatchesTotal && (
              <Button
                type="button"
                size="sm"
                className="h-7 ml-auto gap-1 text-xs"
                onClick={splits.saveSplits}
              >
                <Check className="size-3" />
                Speichern
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={splits.handleRemoveAllSplits}
            >
              <Trash2 className="size-3" />
              Splits entfernen
            </Button>
          </div>
        </div>
      ) : (
        <>
          <CategoryCombobox
            value={
              currentCategoryId === null || currentCategoryId === undefined
                ? UNASSIGNED_CATEGORY_VALUE
                : String(currentCategoryId)
            }
            onValueChange={(value) => {
              onSaveCategory(
                transaction.id,
                value === UNASSIGNED_CATEGORY_VALUE ? null : Number(value),
              );
            }}
            options={categoryOptions}
            showNoneOption
            noneValue={UNASSIGNED_CATEGORY_VALUE}
            placeholder="Kategorie wählen"
            triggerRef={categoryTriggerRef}
            onKeyDown={(event) => {
              onRowKeyDown(event, transaction.id);
            }}
            className={
              currentCategoryId === null || currentCategoryId === undefined
                ? "h-10 w-full !border-orange-500/40 !bg-orange-500/10 hover:!bg-orange-700/10 text-xs text-orange-500 hover:!text-orange-500 shadow-none"
                : "h-10 w-full text-xs shadow-none"
            }
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 gap-1.5 border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-violet-400/50 hover:text-violet-600 dark:hover:border-violet-500/50 dark:hover:text-violet-400"
                onClick={splits.initFirstSplit}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 12h-8" />
                  <path d="M14 6v12" />
                  <path d="M3 12h6" />
                  <path d="M9 8v8" />
                  <path d="M18 8.5V15" />
                </svg>
                Aufteilen
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              Teilt eine Buchung auf mehrere Kategorien auf – z. B. Lebensmittel und Drogerie bei
              einem Einkauf.
            </TooltipContent>
          </Tooltip>

          <style>{`
              .ai-icon-glow::after {
                  content: ''; position: absolute; inset: -3px; border-radius: 12px;
                  background: radial-gradient(circle, rgba(124,58,237,.2) 0%, transparent 70%);
                  animation: ai-icon-pulse 3s ease-in-out infinite; z-index: -1;
              }
              @keyframes ai-icon-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.4; transform:scale(.8); } }

              .ai-sparkle-icon {
                  animation: ai-sparkle-bright 2s ease-in-out infinite;
              }
              @keyframes ai-sparkle-bright { 0%,100% { filter:brightness(1); } 50% { filter:brightness(1.4); } }

              .ai-pulse-dot { animation: ai-dot 2s ease-in-out infinite; }
              @keyframes ai-dot {
                  0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(124,58,237,.4); }
                  50% { opacity:.5; box-shadow: 0 0 0 4px rgba(124,58,237,0); }
              }
          `}</style>

          {currentCategoryId == null && predictedCategoryId != null && (
            <div className="relative rounded-[12px]">
              <div className="relative z-10 rounded-[11px] overflow-hidden border border-violet-500/15 bg-violet-500/[0.03] dark:bg-violet-500/[0.06]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(124,58,237,0.08),transparent_70%)]" />

                <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
                  <div className="ai-icon-glow relative flex size-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-gradient-to-br from-violet-500/18 to-blue-500/18">
                    <Sparkles className="ai-sparkle-icon size-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                      <span className="ai-pulse-dot inline-block size-[5px] rounded-full bg-violet-500" />
                      KI-Vorschlag
                    </p>
                    {(() => {
                      const predicted = categoryOptions.find(
                        (o) => o.value === String(predictedCategoryId),
                      );
                      return (
                        <p className="truncate text-lg font-medium">
                          {predicted?.icon ? (
                            <span className="mr-1.5">{predicted.icon}</span>
                          ) : null}
                          {predicted?.label.replace(/^\s+/, "") ?? "Unbekannt"}
                        </p>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3.5 pb-2.5">
                  <div className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-violet-500/12">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500 transition-all duration-700"
                      style={{ width: `${predictedSimilarityPercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {predictedSimilarityPercent}%
                  </span>
                </div>

                <div className="px-2.5 pb-2.5">
                  <Button
                    type="button"
                    accentColor="#8b5cf6"
                    className="h-[26px] w-full !rounded-[5px] text-[11.5px] font-medium"
                    onClick={() => onSaveCategory(transaction.id, predictedCategoryId)}
                  >
                    <Check className="mr-1 size-3" />
                    Übernehmen
                    <kbd className="ml-1.5 rounded-[3px] border border-current/20 px-1 py-[0.5px] text-[10px]">
                      G
                    </kbd>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
