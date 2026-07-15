import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  CircleAlert,
  Loader2,
  Pencil,
  Repeat,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

import { BankLogo, BrandIcon } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "@/components/category-combobox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { type SelectedBankOption } from "@/lib/bank/selected";
import { type Transaction, type TransactionSplit } from "@/types/transaction";

import { formatAmount, formatDate } from "@/lib/utils/format";
import { type TransactionCategoryOption, UNASSIGNED_CATEGORY_VALUE } from "@/lib/utils/categories";
import { type ZahlungspartnerRecord } from "@/lib/zahlungspartner";
import { updateRefundLink } from "@/lib/transactions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { extractHashtags, extractTagsFromPurpose, isTypingHashtag } from "../utils/tags";

type TransactionRowProps = {
  transaction: Transaction;
  isExpanded: boolean;
  isSubscriptionTransaction: boolean;
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
  const [noteDraft, setNoteDraft] = useState(transaction.texte.anmerkung);
  const [splitDrafts, setSplitDrafts] = useState<TransactionSplit[] | null>(
    transaction.technisch.splits ? transaction.technisch.splits.map((s) => ({ ...s })) : null,
  );
  const [selectedZahlungspartnerId, setSelectedZahlungspartnerId] = useState("");
  const [newZahlungspartnerName, setNewZahlungspartnerName] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingSplits, setSavingSplits] = useState(false);
  const [isInTagMode, setIsInTagMode] = useState(false);
  const [savingIbanMapping, setSavingIbanMapping] = useState(false);
  const [confirmCloseDialogOpen, setConfirmCloseDialogOpen] = useState(false);
  const pendingToggleAction = useRef<(() => void) | null>(null);

  const predictedSimilarityPercent = Math.round((predictedSimilarity ?? 0) * 100);

  const isRefund =
    transaction.betrag.wert > 0 && transaction.technisch.refundRefTransactionId != null;

  const linkedRefundTotal = useMemo(() => {
    if (transaction.betrag.wert >= 0) return 0;
    return allTransactions
      .filter((t) => t.technisch.refundRefTransactionId === transaction.id)
      .reduce((sum, t) => sum + Math.abs(t.betrag.wert), 0);
  }, [transaction, allTransactions]);

  const hasRefunds = linkedRefundTotal > 0;
  const showRefundSection =
    transaction.betrag.wert > 0 ||
    (transaction.betrag.wert < 0 &&
      allTransactions.some((t) => t.technisch.refundRefTransactionId === transaction.id));

  const purpose = transaction.texte.verwendungszweck || "";
  const additionalPurpose = transaction.texte.zusatzVerwendungszweck || "";
  const deviateApplicant = transaction.zahlungspartner.abweichenderAuftraggeberName || "";

  const partnerLogoSrc = transaction.zahlungspartner.logoUrl || undefined;
  const isEntgeltabschluss =
    (transaction.texte.buchungstext.toLowerCase() === "entgeltabschluss" ||
      transaction.texte.buchungstext.toLowerCase() === "abschluss") &&
    transaction.konto.blz === "48250110";
  const displayName = isEntgeltabschluss
    ? "Entgeltabschluss"
    : transaction.zahlungspartner.datenbankName || transaction.zahlungspartner.name || "–";
  const filteredCategoryOptions = categoryOptions;

  const isSaving = savingNote || savingSplits;
  const trimmedSavedNote = transaction.texte.anmerkung.trim();
  const trimmedNoteDraft = noteDraft.trim();
  const noteChanged = trimmedNoteDraft !== trimmedSavedNote;

  const noteTags = useMemo(() => extractHashtags(noteDraft), [noteDraft]);
  const purposeTags = useMemo(
    () =>
      extractTagsFromPurpose(
        [transaction.texte.verwendungszweck, transaction.texte.zusatzVerwendungszweck]
          .filter(Boolean)
          .join(" "),
      ),
    [transaction.texte.verwendungszweck, transaction.texte.zusatzVerwendungszweck],
  );
  const allTags = useMemo(
    () => [...new Set([...purposeTags, ...noteTags])],
    [purposeTags, noteTags],
  );

  // Collapsed row purpose: show primary purpose, fall back to additional
  const collapsedPurpose = purpose || additionalPurpose;

  useEffect(() => {
    setNoteDraft(transaction.texte.anmerkung);
  }, [transaction.id, transaction.texte.anmerkung]);

  useEffect(() => {
    if (!isExpanded) {
      setNoteDraft(transaction.texte.anmerkung);
      setSplitDrafts(null);
    } else {
      setSplitDrafts(
        transaction.technisch.splits ? transaction.technisch.splits.map((s) => ({ ...s })) : null,
      );
    }
  }, [isExpanded, transaction.texte.anmerkung, transaction.technisch.splits]);

  useEffect(() => {
    setSelectedZahlungspartnerId("");
    setNewZahlungspartnerName("");
  }, [transaction.id, unknownIban]);

  useEffect(() => {
    setIsInTagMode(isTypingHashtag(noteDraft));
  }, [noteDraft]);

  useEffect(() => {
    onNoteDraftChange?.(noteDraft);
  }, [noteDraft, onNoteDraftChange]);

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
    if (noteChanged || splitsChanged) {
      pendingToggleAction.current = closeAction;
      setConfirmCloseDialogOpen(true);
    } else {
      closeAction();
    }
  };

  const handleDiscardAndClose = () => {
    setNoteDraft(transaction.texte.anmerkung);
    setSplitDrafts(
      transaction.technisch.splits ? transaction.technisch.splits.map((s) => ({ ...s })) : null,
    );
    pendingToggleAction.current?.();
    pendingToggleAction.current = null;
    setConfirmCloseDialogOpen(false);
  };

  const handleSaveAndClose = async () => {
    if (!noteChanged && !splitsChanged) {
      handleDiscardAndClose();
      return;
    }
    setSavingNote(noteChanged);
    setSavingSplits(splitsChanged);
    try {
      if (noteChanged) {
        await onSaveNote(transaction.id, trimmedNoteDraft || null);
      }
      if (splitsChanged) {
        onSaveSplits(transaction.id, splitDrafts);
      }
    } catch {
      // ignore – user can still discard or cancel
    } finally {
      setSavingNote(false);
      setSavingSplits(false);
    }
    handleDiscardAndClose();
  };

  const saveNote = async () => {
    if (!noteChanged || savingNote) return;
    setSavingNote(true);
    try {
      await onSaveNote(transaction.id, trimmedNoteDraft || null);
    } finally {
      setSavingNote(false);
    }
  };

  const linkUnknownIban = async () => {
    if (!unknownIban || !selectedZahlungspartnerId || savingIbanMapping) return;
    setSavingIbanMapping(true);
    try {
      await onLinkIbanToZahlungspartner(unknownIban, Number(selectedZahlungspartnerId));
    } finally {
      setSavingIbanMapping(false);
    }
  };

  const createOwnerForUnknownIban = async () => {
    const name = newZahlungspartnerName.trim();
    if (!unknownIban || !name || savingIbanMapping) return;
    setSavingIbanMapping(true);
    try {
      await onCreateZahlungspartnerForIban(unknownIban, name);
    } finally {
      setSavingIbanMapping(false);
    }
  };

  const hasSplits = splitDrafts != null && splitDrafts.length > 0;
  const sign = transaction.betrag.wert < 0 ? -1 : 1;
  const absTotal = Math.abs(transaction.betrag.wert);
  const splitAbsSum = hasSplits ? splitDrafts.reduce((sum, s) => sum + Math.abs(s.betrag), 0) : 0;
  const splitMatchesTotal = splitAbsSum === absTotal;

  const initFirstSplit = () => {
    const half = Math.round((absTotal / 2) * 100) / 100;
    const rest = Math.round((absTotal - half) * 100) / 100;
    setSplitDrafts([
      { betrag: half * sign, kategorieId: null },
      { betrag: rest * sign, kategorieId: null },
    ]);
  };

  const handleAddSplit = () => {
    setSplitDrafts((prev) => {
      if (!prev) return prev;
      const extra = Math.round((absTotal / (prev.length + 1)) * 100) / 100;
      const redistributed = Array.from({ length: prev.length + 1 }, () => ({
        betrag: extra * sign,
        kategorieId: null as number | null,
      }));
      const diff = Math.round((absTotal - extra * redistributed.length) * 100) / 100;
      if (diff !== 0) {
        redistributed[redistributed.length - 1].betrag =
          Math.round((redistributed[redistributed.length - 1].betrag + diff * sign) * 100) / 100;
      }
      return redistributed;
    });
  };

  const handleRemoveSplit = (index: number) => {
    if (!splitDrafts) return;
    if (splitDrafts.length <= 2) {
      handleRemoveAllSplits();
      return;
    }
    setSplitDrafts((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== index);
      const remainingAbsSum = next.reduce((s, x) => s + Math.abs(x.betrag), 0);
      const diff = Math.round((absTotal - remainingAbsSum) * 100) / 100;
      if (diff !== 0) {
        next[next.length - 1].betrag =
          Math.round((Math.abs(next[next.length - 1].betrag) + diff) * sign * 100) / 100;
      }
      return next;
    });
  };

  const handleSplitAmountChange = (index: number, value: number) => {
    setSplitDrafts((prev) => {
      if (!prev) return prev;
      const next = prev.map((s) => ({ ...s }));
      next[index].betrag = value * sign;
      return next;
    });
  };

  const handleSplitCategoryChange = (index: number, categoryId: number | null) => {
    setSplitDrafts((prev) => {
      if (!prev) return prev;
      const next = prev.map((s) => ({ ...s }));
      next[index].kategorieId = categoryId;
      return next;
    });
  };

  const handleRemoveAllSplits = () => {
    setSplitDrafts(null);
    onSaveSplits(transaction.id, null);
  };

  const splitsChanged =
    JSON.stringify(splitDrafts) !== JSON.stringify(transaction.technisch.splits);

  const getINGBankBLZ = () => {
    return "50010517";
  };

  return (
    <div className="w-full">
      {/* ── Collapsed row ── */}
      <div
        className={cn(
          "flex w-full items-center border-b border-muted/60 bg-background text-left transition-colors hover:bg-muted/40",
          transaction.technisch.bankDeleted && "bg-red-400/5 hover:bg-red-400/10",
        )}
      >
        <label className="flex cursor-pointer items-center p-2 pl-5 py-7">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelectChange(transaction.id, checked === true)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            aria-label="Transaktion auswählen"
          />
        </label>
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() =>
            isExpanded
              ? handleRequestClose(() => onToggleRow(transaction.id))
              : onToggleRow(transaction.id)
          }
          onKeyDown={(event) => {
            if (isExpanded && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              handleRequestClose(() => onRowKeyDown(event, transaction.id));
            } else {
              onRowKeyDown(event, transaction.id);
            }
          }}
          className="flex w-full cursor-pointer items-center gap-4 px-4 py-3"
        >
          {!selectedBank ? (
            <div className="flex items-center gap-2">
              {accountBank ? (
                <BankLogo
                  src={accountBank.bankLogo || undefined}
                  alt={accountBank.accountName || accountBank.bankName || "Bank"}
                  sizeClassName="size-12 shrink-0 p-1"
                  backgroundClassName="bg-muted/70"
                />
              ) : transaction.technisch.bankDeleted ? (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-semibold">
                  <TriangleAlert size={16} />
                </div>
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted text-[10px] font-semibold text-muted-foreground">
                  {transaction.konto.iban?.slice(0, 2) ?? "—"}
                </div>
              )}
              <span className="ml-2 h-6 w-px shrink-0 bg-border/70" />
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isEntgeltabschluss ? (
                <BrandIcon
                  src="images/bank-logos/sparkasse-lemgo.png"
                  alt="Sparkasse"
                  sizeClassName="size-12 shrink-0 p-1"
                  kind="company"
                  backgroundClassName="bg-muted/70"
                />
              ) : (
                <BrandIcon
                  src={partnerLogoSrc}
                  alt={
                    transaction.zahlungspartner.datenbankName ||
                    transaction.zahlungspartner.name ||
                    "Bank"
                  }
                  sizeClassName="size-12 shrink-0"
                  backgroundClassName={
                    transaction.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                  }
                  kind={transaction.zahlungspartner.isCompany ? "company" : "person"}
                  imgNoPadding={!transaction.zahlungspartner.logoPadding}
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-sm font-medium text-foreground flex gap-2 items-end">
                    {displayName}
                    {displayName !== transaction.zahlungspartner.name ? (
                      <span className="text-xs text-muted-foreground">
                        {transaction.zahlungspartner.name}
                      </span>
                    ) : null}
                    {deviateApplicant !== transaction.zahlungspartner.name && deviateApplicant ? (
                      <span className="text-xs text-muted-foreground">{deviateApplicant}</span>
                    ) : null}
                  </p>

                  {!selectedBank && accountBank ? (
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      · {accountBank.accountName}
                    </span>
                  ) : null}
                  {/* Unknown IBAN badge */}
                  {unknownIban ? (
                    <span className="hidden shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-600 sm:inline dark:text-amber-400">
                      Unbekannte IBAN
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 overflow-ellipsis">
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatDate(transaction.daten.buchungsdatum)}
                  </span>
                  {collapsedPurpose ? (
                    <>
                      <span className="shrink-0 text-xs text-muted-foreground/40">·</span>
                      <span className="min-w-0 max-w-[500px] truncate text-xs text-muted-foreground">
                        {collapsedPurpose}
                      </span>
                    </>
                  ) : null}
                  {trimmedSavedNote ? (
                    <>
                      <span className="shrink-0 text-xs text-muted-foreground/40">·</span>
                      <span className="min-w-0 max-w-[280px] truncate text-xs text-muted-foreground">
                        Anmerkung: {trimmedSavedNote}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {isUnassigned && !transaction.technisch.splits ? (
              <span
                className="size-2 shrink-0 rounded-full bg-orange-500"
                title="Unkategorisiert"
              />
            ) : null}
            {transaction.technisch.splits ? (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                Gesplittet
              </span>
            ) : null}
            {isSubscriptionTransaction ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                <Repeat className="size-3" />
                Abonnement
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              {isRefund && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <Undo2 className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">Rückerstattung</TooltipContent>
                </Tooltip>
              )}
              {hasRefunds && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                      {formatAmount(
                        transaction.betrag.wert + linkedRefundTotal,
                        transaction.betrag.waehrung,
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">Nettopreis inkl. Rückerstattung</TooltipContent>
                </Tooltip>
              )}
              <span
                className={
                  transaction.betrag.wert < 0
                    ? "text-sm font-semibold tabular-nums text-destructive"
                    : "text-sm font-semibold tabular-nums text-green-600"
                }
              >
                {formatAmount(transaction.betrag.wert, transaction.betrag.waehrung)}
              </span>
            </span>
            <span
              className={
                isExpanded
                  ? "text-muted-foreground/40 transition-transform duration-200 rotate-180"
                  : "text-muted-foreground/40 transition-transform duration-200"
              }
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </div>
        </button>
      </div>

      {/* ── Expanded panel ── */}
      {isExpanded ? (
        <div className={cn("border-b border-muted/60 bg-muted/20 text-sm")}>
          {/* Top 3-column detail grid */}
          <div className="flex flex-col w-full">
            {transaction.technisch.bankDeleted && (
              <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>Bankzugang nicht mehr verfügbar</span>
              </div>
            )}
            <div className="grid grid-cols-1 divide-y divide-border/60 border-b border-muted sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {/* Zahlungspartner */}
              <div className="flex flex-col gap-0 divide-y divide-border/60">
                <div className="space-y-3 px-5 py-4">
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                    Zahlungspartner
                  </p>

                  <p className="font-medium leading-tight text-foreground flex flex-col gap-0 items-start">
                    {transaction.zahlungspartner.name ||
                      (isEntgeltabschluss && "Entgeldabschluss") ||
                      "–"}
                    {deviateApplicant !== transaction.zahlungspartner.name && deviateApplicant ? (
                      <span className="text-xs text-muted-foreground">{deviateApplicant}</span>
                    ) : null}
                  </p>

                  {!transaction.zahlungspartner.iban &&
                    transaction.konto.blz == getINGBankBLZ() && (
                      <div className="rounded-md bg-orange-500/10 border border-orange-500/30 p-2 flex items-center gap-3">
                        <CircleAlert className="size-4 shrink-0 text-orange-500" />
                        <p className="text-xs text-orange-500">
                          ING Diba überliefert keine IBAN für eingehende Transaktionen
                        </p>
                      </div>
                    )}

                  <div className="flex flex-col items-start gap-0 pt-1">
                    {partnerBank ? (
                      <p className="text-xs text-muted-foreground">
                        {partnerBank.accountName || "–"}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-2 pt-1">
                      {partnerBank ? (
                        <BankLogo
                          src={partnerBank.bankLogo || undefined}
                          alt={partnerBank.accountName || partnerBank.bankName || "Bank"}
                          sizeClassName="size-12 shrink-0 p-1"
                          kind="company"
                        />
                      ) : null}
                      <div className="space-y-1">
                        {transaction.zahlungspartner.iban ? (
                          <p className="font-mono text-xs text-muted-foreground">
                            {transaction.zahlungspartner.iban}
                          </p>
                        ) : null}
                        {transaction.zahlungspartner.bic ? (
                          <p className="font-mono text-xs text-muted-foreground">
                            {transaction.zahlungspartner.bic}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                {transaction.zahlungspartner.iban && (
                  <div className="space-y-3 px-5 py-4">
                    {ownerId ? (
                      <>
                        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                          Zahlungspartner
                        </p>
                        <Link
                          to={`/settings?tab=zahlungspartner&ownerId=${ownerId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/70 rounded-lg hover:bg-muted/40 transition-colors justify-between">
                            <div className="flex items-center gap-4">
                              <BrandIcon
                                src={partnerLogoSrc}
                                alt={
                                  transaction.zahlungspartner.datenbankName ||
                                  transaction.zahlungspartner.name ||
                                  "Bank"
                                }
                                sizeClassName="size-12 shrink-0"
                                backgroundClassName={
                                  transaction.zahlungspartner.logoWhiteBackground
                                    ? "bg-white"
                                    : "bg-zinc-900"
                                }
                                kind={transaction.zahlungspartner.isCompany ? "company" : "person"}
                                className="rounded-[5px]"
                                imgNoPadding={!transaction.zahlungspartner.logoPadding}
                              />

                              {transaction.zahlungspartner.datenbankName ? (
                                <p className="font-mono text-xs text-muted-foreground">
                                  {transaction.zahlungspartner.datenbankName}
                                </p>
                              ) : null}
                            </div>
                            <Pencil className="size-4 mx-2 text-muted-foreground" />
                          </div>
                        </Link>
                      </>
                    ) : (
                      !isEntgeltabschluss && (
                        <>
                          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                            Unbekannte IBAN
                          </p>
                          <div className="flex flex-col gap-4 ">
                            {/* Link to existing owner */}
                            <div className="flex flex-col gap-2">
                              <p className="text-xs text-muted-foreground">
                                Bestehenden Zahlungspartner verknüpfen
                              </p>
                              <div className="flex gap-2 flex-wrap items-center">
                                <SearchableSelect
                                  value={selectedZahlungspartnerId}
                                  onValueChange={setSelectedZahlungspartnerId}
                                  options={zahlungspartnerOptions.map((owner) => ({
                                    value: String(owner.id),
                                    label: owner.name,
                                  }))}
                                  placeholder="Zahlungspartner wählen …"
                                  searchPlaceholder="Zahlungspartner suchen …"
                                  emptyText="Kein Zahlungspartner gefunden"
                                  triggerClassName="flex-1 text-xs shadow-none h-8"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!selectedZahlungspartnerId || savingIbanMapping}
                                  onClick={() => void linkUnknownIban()}
                                >
                                  {savingIbanMapping && selectedZahlungspartnerId ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Check className="size-3.5" />
                                  )}
                                  Verknüpfen
                                </Button>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                              <div className="h-px flex-1 bg-border/60" />
                              <span className="hidden shrink-0 self-start text-xs text-muted-foreground/40 sm:inline">
                                Oder
                              </span>
                              <div className="h-px flex-1 bg-border/60" />
                            </div>

                            {/* Create new owner */}
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">
                                Neuen Zahlungspartner anlegen
                              </p>
                              <div className="flex gap-2 flex-wrap items-center">
                                <Input
                                  value={newZahlungspartnerName}
                                  onChange={(event) =>
                                    setNewZahlungspartnerName(event.target.value)
                                  }
                                  onKeyDown={(event) => event.stopPropagation()}
                                  placeholder="Name …"
                                  className="h-8 min-w-30 flex-1 rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!newZahlungspartnerName.trim() || savingIbanMapping}
                                  onClick={() => void createOwnerForUnknownIban()}
                                >
                                  {savingIbanMapping && newZahlungspartnerName.trim() ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Check className="size-3.5" />
                                  )}
                                  Anlegen
                                </Button>
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Verwendungszweck */}
              <div className="space-y-2 px-5 py-4">
                <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                  Verwendungszweck
                </p>

                {purpose ? (
                  <p className="whitespace-normal leading-relaxed text-foreground">{purpose}</p>
                ) : null}

                {additionalPurpose && additionalPurpose !== purpose ? (
                  <div
                    className={
                      purpose ? "flex flex-col gap-0.5 border-t border-border/50 pt-2" : ""
                    }
                  >
                    {purpose ? (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/50">
                        Zusatz
                      </span>
                    ) : null}
                    <p className="whitespace-normal leading-relaxed text-foreground">
                      {additionalPurpose}
                    </p>
                  </div>
                ) : null}

                {!purpose && !additionalPurpose ? <p className="text-muted-foreground">–</p> : null}

                {transaction.texte.buchungstext ? (
                  <p className="pt-1 font-mono text-xs text-muted-foreground">
                    {transaction.texte.buchungstext}
                  </p>
                ) : null}
                {transaction.daten.wertstellungsdatum &&
                transaction.daten.wertstellungsdatum !== transaction.daten.buchungsdatum ? (
                  <p className="pt-1 text-xs text-muted-foreground">
                    Wertstellung: {formatDate(transaction.daten.wertstellungsdatum)}
                  </p>
                ) : null}
              </div>

              {/* Kategorie / Splits */}
              <div className="space-y-3 px-5 py-4" onClick={(event) => event.stopPropagation()}>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                  {hasSplits ? "Splits" : "Kategorie"}
                </p>

                {hasSplits ? (
                  <div className="space-y-2">
                    {splitDrafts.map((split, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="relative w-24 shrink-0">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/40">
                            €
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={Math.abs(split.betrag)}
                            onChange={(e) => handleSplitAmountChange(index, Number(e.target.value))}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="h-8 w-full rounded-md border border-input bg-background pl-6 pr-2 text-xs tabular-nums text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          />
                        </div>
                        <CategoryCombobox
                          value={
                            split.kategorieId == null
                              ? UNASSIGNED_CATEGORY_VALUE
                              : String(split.kategorieId)
                          }
                          onValueChange={(value) => {
                            handleSplitCategoryChange(
                              index,
                              value === UNASSIGNED_CATEGORY_VALUE ? null : Number(value),
                            );
                          }}
                          options={filteredCategoryOptions}
                          showNoneOption
                          noneValue={UNASSIGNED_CATEGORY_VALUE}
                          placeholder="Kategorie"
                          onKeyDown={(e) => e.stopPropagation()}
                          className={
                            split.kategorieId == null
                              ? "h-8 flex-1 !border-orange-500/40 !bg-orange-500/10 hover:!bg-orange-700/10 text-xs text-orange-500 hover:!text-orange-500 shadow-none"
                              : "h-8 flex-1 text-xs shadow-none"
                          }
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSplit(index)}
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive"
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
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-px bg-border/40" />
                      <span
                        className={`text-xs tabular-nums ${
                          splitMatchesTotal ? "text-green-600" : "text-destructive"
                        }`}
                      >
                        {formatAmount(splitAbsSum, transaction.betrag.waehrung)} /{" "}
                        {formatAmount(absTotal, transaction.betrag.waehrung)}
                        {splitMatchesTotal ? " ✓" : " ✗"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleAddSplit}
                      >
                        + Split
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={handleRemoveAllSplits}
                      >
                        Splits entfernen
                      </Button>
                      {splitsChanged && splitMatchesTotal && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 ml-auto text-xs"
                          onClick={() => onSaveSplits(transaction.id, splitDrafts)}
                        >
                          <Check className="mr-1 size-3" />
                          Speichern
                        </Button>
                      )}
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
                      options={filteredCategoryOptions}
                      showNoneOption
                      noneValue={UNASSIGNED_CATEGORY_VALUE}
                      placeholder="Kategorie wählen"
                      triggerRef={categoryTriggerRef}
                      onKeyDown={(event) => {
                        onRowKeyDown(event, transaction.id);
                      }}
                      className={
                        currentCategoryId === null || currentCategoryId === undefined
                          ? "h-8 w-full !border-orange-500/40 !bg-orange-500/10 hover:!bg-orange-700/10 text-xs text-orange-500 hover:!text-orange-500 shadow-none"
                          : "h-8 w-full text-xs shadow-none"
                      }
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-full text-xs"
                      onClick={initFirstSplit}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="mr-1.5 size-3.5"
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
                                const predicted = filteredCategoryOptions.find(
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
                              variant="ghost"
                              className="h-[26px] w-full !rounded-[5px] border border-violet-500/30 bg-transparent text-[11.5px] font-medium hover:border-violet-500/55 hover:bg-violet-500/8 hover:text-violet-600 dark:hover:text-violet-400"
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
            </div>
          </div>

          {/* ── Bottom actions row ── */}
          <div className="flex flex-col gap-0 divide-y divide-border/60">
            <div
              className={cn(
                "grid grid-cols-1 divide-y divide-border/60",
                showRefundSection && "sm:grid-cols-2 sm:divide-x sm:divide-y-0",
              )}
            >
              {/* Note */}
              <div
                className={cn("px-4 py-4", showRefundSection && "sm:border-r sm:border-border/60")}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                    Anmerkung
                  </p>

                  {isInTagMode && (
                    <div className="text-[10px] flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
                      <span className="inline-block size-1.5 animate-pulse rounded-full bg-violet-500" />
                      Hashtag eingabe erkannt
                    </div>
                  )}
                </div>
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder="Anmerkung zu dieser Transaktion"
                  className={cn(
                    "h-18 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                    isInTagMode
                      ? "border-violet-400 focus-visible:border-violet-400 focus-visible:ring-violet-500/30"
                      : "border-input focus-visible:border-ring",
                  )}
                />
                <div className="flex items-start justify-between gap-3 mt-2">
                  <div className="flex flex-col items-start gap-1.5">
                    {allTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {allTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!noteChanged || savingNote}
                    onClick={() => void saveNote()}
                  >
                    {savingNote ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    {savingNote ? "Speichere …" : "Anmerkung speichern"}
                  </Button>
                </div>
              </div>

              {/* Rückerstattung */}
              {showRefundSection ? (
                <div className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
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

            {/* Delete */}
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

function RefundSectionIncoming({
  transaction,
  allTransactions,
  onRefundLinkChange,
}: {
  transaction: Transaction;
  allTransactions: Transaction[];
  onRefundLinkChange: () => void;
}) {
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const linkedTransaction = transaction.technisch.refundRefTransactionId
    ? allTransactions.find((t) => t.id === transaction.technisch.refundRefTransactionId)
    : null;

  const outgoingList = useMemo(
    () => allTransactions.filter((t) => t.betrag.wert < 0),
    [allTransactions],
  );

  const handleLink = async (targetId: number) => {
    setLinkingId(targetId);
    try {
      await updateRefundLink(transaction.id, targetId);
      onRefundLinkChange();
      setDialogOpen(false);
    } finally {
      setLinkingId(null);
    }
  };

  const handleUnlink = async () => {
    if (!transaction) return;
    setLinkingId(transaction.id);
    try {
      await updateRefundLink(transaction.id, null);
      onRefundLinkChange();
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Diese Gutschrift ist eine Rückerstattung für
      </p>
      {linkedTransaction ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground">
            <span className="font-medium text-foreground">
              {linkedTransaction.zahlungspartner.datenbankName ||
                linkedTransaction.zahlungspartner.name ||
                "–"}
            </span>
            <span>
              {" · "}
              {formatDate(linkedTransaction.daten.buchungsdatum)}
            </span>
            <span className="tabular-nums text-red-500">
              {" · "}
              {formatAmount(Math.abs(linkedTransaction.betrag.wert), linkedTransaction.betrag.waehrung)}
            </span>
          </span>
          <button
            type="button"
            disabled={linkingId !== null}
            onClick={() => void handleUnlink()}
            className="shrink-0 text-xs text-destructive underline-offset-2 hover:underline disabled:opacity-50"
          >
            {linkingId === transaction.id ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              "Entfernen"
            )}
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="flex w-full justify-start gap-2 shadow-none h-8 text-muted-foreground font-normal"
        >
          <Search className="size-3.5 shrink-0 opacity-50" />
          <span>Ausgehende Zahlung auswählen …</span>
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Ausgehende Zahlung auswählen</DialogTitle>
            <DialogDescription>
              Wähle die ursprüngliche Zahlung aus, auf die sich diese Rückerstattung bezieht
            </DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Nach Name, Betrag oder Datum suchen …" />
            <CommandList>
              <CommandEmpty>Keine ausgehende Zahlung gefunden</CommandEmpty>
              <CommandGroup>
                {outgoingList.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`${t.zahlungspartner.name || ""} ${formatAmount(Math.abs(t.betrag.wert), t.betrag.waehrung)} ${formatDate(t.daten.buchungsdatum)}`}
                    onSelect={() => void handleLink(t.id)}
                    disabled={linkingId === t.id}
                  >
                    <BrandIcon
                      src={t.zahlungspartner.logoUrl || undefined}
                      alt={t.zahlungspartner.datenbankName || t.zahlungspartner.name || "?"}
                      sizeClassName="size-9 shrink-0"
                      backgroundClassName={
                        t.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                      }
                      kind={t.zahlungspartner.isCompany ? "company" : "person"}
                      imgNoPadding={!t.zahlungspartner.logoPadding}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {t.zahlungspartner.datenbankName || t.zahlungspartner.name || "–"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(t.daten.buchungsdatum)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-red-500">
                      {formatAmount(Math.abs(t.betrag.wert), t.betrag.waehrung)}
                    </span>
                    {linkingId === t.id ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RefundSectionOutgoing({
  transaction,
  allTransactions,
  onRefundLinkChange,
}: {
  transaction: Transaction;
  allTransactions: Transaction[];
  onRefundLinkChange: () => void;
}) {
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);

  const refundTransactions = useMemo(() => {
    return allTransactions.filter((t) => t.technisch.refundRefTransactionId === transaction.id);
  }, [allTransactions, transaction.id]);

  const handleUnlink = async (refundTransactionId: number) => {
    setUnlinkingId(refundTransactionId);
    try {
      await updateRefundLink(refundTransactionId, null);
      onRefundLinkChange();
    } finally {
      setUnlinkingId(null);
    }
  };

  if (refundTransactions.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Rückerstattungen für diese Ausgabe
      </p>
      <div className="space-y-1">
        {refundTransactions.map((refund) => (
          <div
            key={refund.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate text-muted-foreground">
              <span className="font-medium text-foreground">
                {refund.zahlungspartner.datenbankName || refund.zahlungspartner.name || "–"}
              </span>
              <span>
                {" · "}
                {formatDate(refund.daten.buchungsdatum)}
              </span>
              <span className="tabular-nums text-green-500">
                {" · "}
                +{formatAmount(Math.abs(refund.betrag.wert), refund.betrag.waehrung)}
              </span>
            </span>
            <button
              type="button"
              disabled={unlinkingId !== null}
              onClick={() => void handleUnlink(refund.id)}
              className="shrink-0 text-xs text-destructive underline-offset-2 hover:underline disabled:opacity-50"
            >
              {unlinkingId === refund.id ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                "Entfernen"
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
