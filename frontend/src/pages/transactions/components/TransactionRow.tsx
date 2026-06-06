import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  CircleAlert,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

import { BankLogo, BrandIcon } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "@/components/category-combobox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { type SelectedBankOption } from "@/lib/bank/selected";
import { type Transaction } from "@/types/transaction";

import { formatAmount, formatDate } from "@/lib/utils/format";
import { type TransactionCategoryOption, UNASSIGNED_CATEGORY_VALUE } from "@/lib/utils/categories";
import { type KontoinhaberRecord } from "@/lib/kontoinhaber";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { extractHashtags, extractTagsFromPurpose, isTypingHashtag } from "../utils/tags.utils";

type TransactionRowProps = {
  transaction: Transaction;
  isExpanded: boolean;
  isUnassigned: boolean;
  isSelected: boolean;
  predictedCategoryId: number | null;
  predictedSimilarity: number | null;
  accountBank: SelectedBankOption | null;
  partnerBank: SelectedBankOption | null;
  selectedBank: SelectedBankOption | null;
  categoryOptions: TransactionCategoryOption[];
  kontoinhaberOptions: KontoinhaberRecord[];
  currentCategoryId: number | null;
  unknownIban: string | null;
  onToggleRow: (transactionId: number) => void;
  onRowKeyDown: (event: KeyboardEvent<Element>, transactionId: number) => void;
  onSelectChange: (transactionId: number, selected: boolean) => void;
  onSaveCategory: (transactionId: number, categoryId: number | null) => void;
  onSaveNote: (transactionId: number, note: string | null) => Promise<void>;
  onNoteDraftChange?: (draft: string) => void;
  onLinkIbanToKontoinhaber: (iban: string, kontoinhaberId: number) => Promise<void>;
  onCreateKontoinhaberForIban: (iban: string, name: string) => Promise<void>;
  onDelete: (transaction: Transaction) => void;
  categoryTriggerRef: (node: HTMLButtonElement | null) => void;
  ownerId?: number | undefined;
};

export function TransactionRow({
  transaction,
  isExpanded,
  isUnassigned,
  isSelected,
  predictedCategoryId,
  predictedSimilarity,
  accountBank,
  partnerBank,
  selectedBank,
  categoryOptions,
  kontoinhaberOptions,
  currentCategoryId,
  unknownIban,
  onToggleRow,
  onRowKeyDown,
  onSelectChange,
  onSaveCategory,
  onSaveNote,
  onNoteDraftChange,
  onLinkIbanToKontoinhaber,
  onCreateKontoinhaberForIban,
  onDelete,
  categoryTriggerRef,
  ownerId,
}: TransactionRowProps) {
  const [noteDraft, setNoteDraft] = useState(transaction.texte.anmerkung);
  const [selectedKontoinhaberId, setSelectedKontoinhaberId] = useState("");
  const [newKontoinhaberName, setNewKontoinhaberName] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [isInTagMode, setIsInTagMode] = useState(false);
  const [savingIbanMapping, setSavingIbanMapping] = useState(false);
  const [confirmCloseDialogOpen, setConfirmCloseDialogOpen] = useState(false);
  const pendingToggleAction = useRef<(() => void) | null>(null);

  const predictedSimilarityPercent = Math.round((predictedSimilarity ?? 0) * 100);

  const purpose = transaction.texte.verwendungszweck || "";
  const additionalPurpose = transaction.texte.zusatzVerwendungszweck || "";
  const deviateApplicant = transaction.zahlungspartner.abweichenderAuftraggeberName || "";

  const partnerLogoSrc = transaction.zahlungspartner.logoUrl || undefined;
  const isEntgeltabschluss =
    transaction.texte.buchungstext.toLowerCase() === "entgeltabschluss" &&
    transaction.konto.blz === "48250110";
  const displayName = isEntgeltabschluss
    ? "Entgeltabschluss"
    : transaction.zahlungspartner.datenbankName || transaction.zahlungspartner.name || "–";
  const isIncome = transaction.betrag.wert >= 0;

  const filteredCategoryOptions = useMemo(
    () =>
      categoryOptions.filter((opt) => (isIncome ? opt.typ === "Einnahme" : opt.typ === "Ausgabe")),
    [categoryOptions, isIncome],
  );

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
    }
  }, [isExpanded, transaction.texte.anmerkung]);

  useEffect(() => {
    setSelectedKontoinhaberId("");
    setNewKontoinhaberName("");
  }, [transaction.id, unknownIban]);

  useEffect(() => {
    setIsInTagMode(isTypingHashtag(noteDraft));
  }, [noteDraft]);

  useEffect(() => {
    onNoteDraftChange?.(noteDraft);
  }, [noteDraft, onNoteDraftChange]);

  useEffect(() => {
    if (!isExpanded || currentCategoryId != null || predictedCategoryId == null) return;

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
    if (noteChanged) {
      pendingToggleAction.current = closeAction;
      setConfirmCloseDialogOpen(true);
    } else {
      closeAction();
    }
  };

  const handleDiscardAndClose = () => {
    setNoteDraft(transaction.texte.anmerkung);
    pendingToggleAction.current?.();
    pendingToggleAction.current = null;
    setConfirmCloseDialogOpen(false);
  };

  const handleSaveAndClose = async () => {
    if (!noteChanged) {
      handleDiscardAndClose();
      return;
    }
    setSavingNote(true);
    try {
      await onSaveNote(transaction.id, trimmedNoteDraft || null);
    } catch {
      // ignore – user can still discard or cancel
    } finally {
      setSavingNote(false);
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
    if (!unknownIban || !selectedKontoinhaberId || savingIbanMapping) return;
    setSavingIbanMapping(true);
    try {
      await onLinkIbanToKontoinhaber(unknownIban, Number(selectedKontoinhaberId));
    } finally {
      setSavingIbanMapping(false);
    }
  };

  const createOwnerForUnknownIban = async () => {
    console.log("Creating owner for IBAN", unknownIban, "with name", newKontoinhaberName);
    const name = newKontoinhaberName.trim();
    if (!unknownIban || !name || savingIbanMapping) return;
    setSavingIbanMapping(true);
    try {
      await onCreateKontoinhaberForIban(unknownIban, name);
    } finally {
      setSavingIbanMapping(false);
    }
  };

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
            {isUnassigned ? (
              <span
                className="size-2 shrink-0 rounded-full bg-orange-500"
                title="Unkategorisiert"
              />
            ) : null}
            <span
              className={
                transaction.betrag.wert < 0
                  ? "text-sm font-semibold tabular-nums text-destructive"
                  : "text-sm font-semibold tabular-nums text-green-600"
              }
            >
              {formatAmount(transaction.betrag.wert, transaction.betrag.waehrung)}
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
                          Kontoinhaber
                        </p>
                        <Link
                          to={`/settings?tab=kontoinhaber&ownerId=${ownerId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/70 rounded-lg hover:bg-muted/40 transition-colors justify-between">
                            <div className="flex items-center gap-2">
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
                              <div className="space-y-1">
                                {transaction.zahlungspartner.datenbankName ? (
                                  <p className="font-mono text-xs text-muted-foreground">
                                    {transaction.zahlungspartner.datenbankName}
                                  </p>
                                ) : null}
                              </div>
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
                                Bestehenden Kontoinhaber verknüpfen
                              </p>
                              <div className="flex gap-2 flex-wrap items-center">
                                <Select
                                  value={selectedKontoinhaberId}
                                  onValueChange={setSelectedKontoinhaberId}
                                >
                                  <SelectTrigger className="flex-1 text-xs shadow-none">
                                    <SelectValue placeholder="Kontoinhaber wählen …" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {kontoinhaberOptions.map((owner) => (
                                      <SelectItem key={owner.id} value={String(owner.id)}>
                                        {owner.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!selectedKontoinhaberId || savingIbanMapping}
                                  onClick={() => void linkUnknownIban()}
                                >
                                  {savingIbanMapping && selectedKontoinhaberId ? (
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
                                Neuen Kontoinhaber anlegen
                              </p>
                              <div className="flex gap-2 flex-wrap items-center">
                                <Input
                                  value={newKontoinhaberName}
                                  onChange={(event) => setNewKontoinhaberName(event.target.value)}
                                  onKeyDown={(event) => event.stopPropagation()}
                                  placeholder="Name …"
                                  className="h-8 min-w-30 flex-1 rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!newKontoinhaberName.trim() || savingIbanMapping}
                                  onClick={() => void createOwnerForUnknownIban()}
                                >
                                  {savingIbanMapping && newKontoinhaberName.trim() ? (
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

              {/* Kategorie */}
              <div className="space-y-2 px-5 py-4" onClick={(event) => event.stopPropagation()}>
                <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                  Kategorie
                </p>
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
                    {/* Inner card */}
                    <div className="relative z-10 rounded-[11px] overflow-hidden border border-violet-500/15 bg-violet-500/[0.03] dark:bg-violet-500/[0.06]">
                      {/* Subtle top radial glow */}
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(124,58,237,0.08),transparent_70%)]" />

                      {/* Header */}
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

                      {/* Confidence bar */}
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

                      {/* Action */}
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
              </div>
            </div>
          </div>

          {/* ── Bottom actions row ── */}
          <div className="flex flex-col gap-0 divide-y divide-border/60">
            {/* Note */}
            <div className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
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
        description="Die Anmerkung wurde noch nicht gespeichert. Was möchtest du tun?"
        confirmLabel="Verwerfen"
        saveLabel="Speichern"
        cancelLabel="Abbrechen"
        destructive={false}
        saving={savingNote}
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
