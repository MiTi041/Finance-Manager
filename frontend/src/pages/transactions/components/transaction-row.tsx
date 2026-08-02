import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { type SelectedBankOption } from "@/lib/bank/selected";
import { type Transaction, type TransactionSplit } from "@/types/transaction";
import { type TransactionCategoryOption } from "@/lib/utils/categories";
import { type ZahlungspartnerRecord } from "@/lib/zahlungspartner";
import { cn } from "@/lib/utils";

import { CategorySection } from "./category-section";
import { CollapsedRow } from "./collapsed-row";
import { NoteSection } from "./note-section";
import { PurposeSection } from "./purpose-section";
import { RefundSectionIncoming, RefundSectionOutgoing } from "./refund-section";
import { ZahlungspartnerSection } from "./zahlungspartner-section";
import { useNote } from "../hooks/use-note";
import { useSplits } from "../hooks/use-splits";
import {
  type SubscriptionOverride,
  useTransactionDerivations,
} from "../hooks/use-transaction-derivations";

type TransactionRowProps = {
  transaction: Transaction;
  isExpanded: boolean;
  isSubscriptionTransaction: boolean;
  subscriptionOverride: SubscriptionOverride | null;
  subscriptionLink: { counterpartyName: string; amount: number } | null;
  isUnassigned: boolean;
  isSelected: boolean;
  predictedCategoryId: number | null;
  predictedSimilarity: number | null;
  accountBank: SelectedBankOption | null;
  partnerBank: SelectedBankOption | null;
  selectedBank: SelectedBankOption | null;
  categoryOptions: TransactionCategoryOption[];
  zahlungspartnerOptions: ZahlungspartnerRecord[];
  currentCategoryId: number | null;
  unknownIban: string | null;
  onToggleRow: (transactionId: number) => void;
  onOpenRefundSection: (transactionId: number) => void;
  onRowKeyDown: (event: KeyboardEvent<Element>, transactionId: number) => void;
  onSelectChange: (transactionId: number, selected: boolean) => void;
  onSaveCategory: (transactionId: number, categoryId: number | null) => void;
  onSaveNote: (transactionId: number, note: string | null) => Promise<void>;
  onSaveSplits: (transactionId: number, splits: TransactionSplit[] | null) => void;
  onNoteDraftChange?: (draft: string) => void;
  onLinkIbanToZahlungspartner: (iban: string, zahlungspartnerId: number) => Promise<void>;
  onCreateZahlungspartnerForIban: (iban: string, name: string) => Promise<void>;
  onDelete: (transaction: Transaction) => void;
  categoryTriggerRef: (node: HTMLButtonElement | null) => void;
  ownerId?: number | undefined;
  allTransactions: Transaction[];
  onRefundLinkChange: () => void;
};

export function TransactionRow({
  transaction,
  isExpanded,
  isSubscriptionTransaction,
  subscriptionOverride,
  subscriptionLink,
  isUnassigned,
  isSelected,
  predictedCategoryId,
  predictedSimilarity,
  accountBank,
  partnerBank,
  selectedBank,
  categoryOptions,
  zahlungspartnerOptions,
  currentCategoryId,
  unknownIban,
  onToggleRow,
  onOpenRefundSection,
  onRowKeyDown,
  onSelectChange,
  onSaveCategory,
  onSaveNote,
  onSaveSplits,
  onNoteDraftChange,
  onLinkIbanToZahlungspartner,
  onCreateZahlungspartnerForIban,
  onDelete,
  categoryTriggerRef,
  ownerId,
  allTransactions,
  onRefundLinkChange,
}: TransactionRowProps) {
  const derivations = useTransactionDerivations(transaction, subscriptionOverride);
  const note = useNote(transaction, isExpanded, onSaveNote, onNoteDraftChange);
  const splits = useSplits(transaction, isExpanded, onSaveSplits);

  const [confirmCloseDialogOpen, setConfirmCloseDialogOpen] = useState(false);
  const pendingToggleAction = useRef<(() => void) | null>(null);

  const isSaving = note.savingNote || splits.savingSplits;

  useEffect(() => {
    if (!isExpanded || currentCategoryId != null || predictedCategoryId == null) return;
    if (transaction.technisch.splits) return;

    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "g" && e.key !== "G") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      onSaveCategory(transaction.id, predictedCategoryId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isExpanded, currentCategoryId, predictedCategoryId, transaction.id, onSaveCategory]);

  const handleRequestClose = (closeAction: () => void) => {
    if (note.noteChanged || splits.splitsChanged) {
      pendingToggleAction.current = closeAction;
      setConfirmCloseDialogOpen(true);
    } else {
      closeAction();
    }
  };

  const handleDiscardAndClose = () => {
    note.resetNote();
    splits.resetSplits();
    pendingToggleAction.current?.();
    pendingToggleAction.current = null;
    setConfirmCloseDialogOpen(false);
  };

  const handleSaveAndClose = async () => {
    if (!note.noteChanged && !splits.splitsChanged) {
      handleDiscardAndClose();
      return;
    }
    note.setSavingNote(note.noteChanged);
    splits.setSavingSplits(splits.splitsChanged);
    try {
      if (note.noteChanged) {
        await onSaveNote(transaction.id, note.trimmedNoteDraft || null);
      }
      if (splits.splitsChanged) {
        onSaveSplits(transaction.id, splits.splitDrafts);
      }
    } catch {
      // ignore – user can still discard or cancel
    } finally {
      note.setSavingNote(false);
      splits.setSavingSplits(false);
    }
    handleDiscardAndClose();
  };

  return (
    <div className="w-full">
      <CollapsedRow
        transaction={transaction}
        subscriptionOverride={subscriptionOverride}
        isExpanded={isExpanded}
        isSelected={isSelected}
        selectedBank={selectedBank}
        accountBank={accountBank}
        isUnassigned={isUnassigned}
        isSubscriptionTransaction={isSubscriptionTransaction}
        subscriptionLink={subscriptionLink}
        unknownIban={unknownIban}
        onToggleRow={onToggleRow}
        onOpenRefundSection={onOpenRefundSection}
        onRequestClose={handleRequestClose}
        onRowKeyDown={onRowKeyDown}
        onSelectChange={onSelectChange}
      />

      {isExpanded ? (
        <div className={cn("border-b border-muted/60 bg-muted/20 text-sm")}>
          <div className="flex flex-col w-full">
            {transaction.technisch.bankDeleted && (
              <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>Bankzugang nicht mehr verfügbar</span>
              </div>
            )}
            <div className="grid grid-cols-1 divide-y divide-border/60 border-b border-muted sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <ZahlungspartnerSection
                transaction={transaction}
                subscriptionOverride={subscriptionOverride}
                partnerBank={partnerBank}
                ownerId={ownerId}
                unknownIban={unknownIban}
                zahlungspartnerOptions={zahlungspartnerOptions}
                onLinkIbanToZahlungspartner={onLinkIbanToZahlungspartner}
                onCreateZahlungspartnerForIban={onCreateZahlungspartnerForIban}
              />
              <PurposeSection transaction={transaction} />
              <CategorySection
                transaction={transaction}
                categoryOptions={categoryOptions}
                currentCategoryId={currentCategoryId}
                predictedCategoryId={predictedCategoryId}
                predictedSimilarity={predictedSimilarity}
                categoryTriggerRef={categoryTriggerRef}
                onSaveCategory={onSaveCategory}
                onRowKeyDown={onRowKeyDown}
                splits={splits}
              />
            </div>
          </div>

          <div className="flex flex-col gap-0 divide-y divide-border/60">
            <div
              className={cn(
                "grid grid-cols-1 divide-y divide-border/60",
                derivations.showRefundSection && "sm:grid-cols-2 sm:divide-x sm:divide-y-0",
              )}
            >
              <NoteSection note={note} showRefundSection={derivations.showRefundSection} />

              {derivations.showRefundSection ? (
                <div
                  id={`refund-section-${transaction.id}`}
                  className="px-5 py-4"
                  onClick={(event) => event.stopPropagation()}
                >
                  {transaction.betrag.wert > 0 ? (
                    <RefundSectionIncoming
                      transaction={transaction}
                      allTransactions={allTransactions}
                      onRefundLinkChange={onRefundLinkChange}
                    />
                  ) : (
                    <RefundSectionOutgoing
                      transaction={transaction}
                      allTransactions={allTransactions}
                      onRefundLinkChange={onRefundLinkChange}
                    />
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex justify-end px-4 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDelete(transaction)}
              >
                <Trash2 className="size-3.5" />
                Löschen
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmCloseDialogOpen}
        title="Ungespeicherte Änderungen"
        description="Es gibt ungespeicherte Änderungen. Was möchtest du tun?"
        confirmLabel="Verwerfen"
        saveLabel="Speichern"
        cancelLabel="Abbrechen"
        destructive={false}
        saving={isSaving}
        onSave={() => void handleSaveAndClose()}
        onConfirm={handleDiscardAndClose}
        onOpenChange={(open) => {
          if (open) return;
          setConfirmCloseDialogOpen(false);
          pendingToggleAction.current = null;
        }}
      />
    </div>
  );
}
