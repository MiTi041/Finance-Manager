import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleX } from "lucide-react";
import { toast } from "sonner";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { VirtualizedList, type VirtualizedListRef } from "@/components/virtualized-list";

import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useFinanceData } from "@/hooks/use-finance-data";

import { fetchCategories } from "@/lib/categories/api";
import { triggerAutoCategorize } from "@/lib/categories/auto-categorize";
import { updateTransactionCategory } from "@/lib/categories/category-transactions";
import { type FinanceCategory } from "@/lib/categories/types";
import {
  createZahlungspartner,
  fetchZahlungspartnerReferenceData,
  type ZahlungspartnerRecord,
} from "@/lib/zahlungspartner";
import { deleteTransaction, updateTransactionNote, updateTransactionSplits } from "@/lib/transactions";
import { updateIbanZahlungspartnerMapping } from "@/lib/reference-data";

import { type Transaction } from "@/types/transaction";

import { TransactionRow } from "./components/transaction-row";
import { TransactionsFilterBar } from "./components/transactions-filter-bar";
import { BatchActionsBar } from "./components/batch-actions-bar";
import { useSelection } from "./hooks/use-selection";
import { useBatchActions } from "./hooks/use-batch-actions";
import { buildCategoryOptions, type TransactionCategoryOption } from "@/lib/utils/categories";
import { buildLinkedAccountLookup } from "@/lib/utils/accounts";
import { formatDate } from "@/lib/utils/format";
import { normalizeIban } from "@/lib/iban";

export default function TransactionsPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();

  const {
    loading,
    error,
    transactions = [],
    reload,
    linkedAccounts = [],
    selectedBank = null,
  } = useFinanceData(dateFilter, { deletedBankTransactionsIncluded: true });

  const [ibanToZahlungspartner, setIbanToZahlungspartner] = useState<Map<string, number>>(new Map());
  const [zahlungspartner, setZahlungspartner] = useState<ZahlungspartnerRecord[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [predictionsMap, setPredictionsMap] = useState<
    Map<number, { categoryId: number; similarity: number }>
  >(new Map());
  const [expandedTransactionId, setExpandedTransactionId] = useState<number | null>(null);
  const expandedNoteDraft = useRef<string>("");
  const [pendingToggleId, setPendingToggleId] = useState<number | null>(null);
  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyUnknownIban, setOnlyUnknownIban] = useState(false);
  const [showDeletedBanks, setShowDeletedBanks] = useState(false);
  const [amountFilter, setAmountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibleTransactions, setVisibleTransactions] = useState<Transaction[]>([]);
  const [pendingCategoryFocusId, setPendingCategoryFocusId] = useState<number | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState(false);
  const categoryTriggerRefs = useRef(new Map<number, HTMLButtonElement | null>());
  const virtualListRef = useRef<VirtualizedListRef>(null);

  const loadZahlungspartnerData = useCallback(async (options?: { forceRefresh?: boolean }) => {
    try {
      const data = await fetchZahlungspartnerReferenceData(options);

      const nameById = new Map<number, string>();
      data.zahlungspartner.forEach((owner) => {
        nameById.set(owner.id, owner.name);
      });

      const lookup = new Map<string, number>();
      data.iban_mappings.forEach((mapping) => {
        const iban = normalizeIban(mapping.iban);
        if (iban) {
          lookup.set(iban, mapping.f_zahlungspartner_id);
        }
      });

      setZahlungspartner(data.zahlungspartner);
      setIbanToZahlungspartner(lookup);
    } catch {
      setZahlungspartner([]);
      setIbanToZahlungspartner(new Map());
    }
  }, []);

  useEffect(() => {
    void loadZahlungspartnerData();
  }, [loadZahlungspartnerData]);

  useEffect(() => {
    let active = true;

    void fetchCategories()
      .then((next) => {
        if (active) setCategories(next);
      })
      .catch(() => {
        if (active) setCategories([]);
      });

    void triggerAutoCategorize()
      .then((result) => {
        if (!active) return;
        const map = new Map<number, { categoryId: number; similarity: number }>();
        for (const p of result.predictions) {
          map.set(p.transaction_id, {
            categoryId: p.predicted_category_id,
            similarity: p.similarity,
          });
        }
        setPredictionsMap(map);
      })
      .catch(() => {
        if (active) setPredictionsMap(new Map());
      });

    return () => {
      active = false;
    };
  }, []);

  const linkedAccountByIban = useMemo(
    () => buildLinkedAccountLookup(linkedAccounts),
    [linkedAccounts],
  );

  const categoryOptions = useMemo(() => buildCategoryOptions(categories), [categories]);

  const categoryFilterOptions = useMemo<TransactionCategoryOption[]>(
    () => [
      { value: "all", label: "Alle Kategorien", icon: null, depth: 0, typ: "" },
      ...categoryOptions,
    ],
    [categoryOptions],
  );

  const filterCounts = useMemo(() => {
    let unassigned = 0;
    let unknownIban = 0;
    let deletedBank = 0;

    for (const transaction of transactions) {
      const kategorieId = transaction.technisch.kategorieId;
      const isUnassigned = kategorieId == null;
      const isIncome = transaction.betrag.wert >= 0;
      const partnerIban = normalizeIban(transaction.zahlungspartner.iban);
      const isUnknownIban = partnerIban.length > 0 && !ibanToZahlungspartner.has(partnerIban);
      const isBankDeleted = transaction.technisch.bankDeleted;

      if (amountFilter === "income" && !isIncome) continue;
      if (amountFilter === "expense" && isIncome) continue;
      if (categoryFilter !== "all" && String(kategorieId ?? "") !== categoryFilter) {
        continue;
      }

      {
        let passes = true;
        if (!showDeletedBanks && isBankDeleted) passes = false;
        if (onlyUnknownIban && !isUnknownIban) passes = false;
        if (passes && isUnassigned) unassigned++;
      }

      {
        let passes = true;
        if (!showDeletedBanks && isBankDeleted) passes = false;
        if (onlyUnassigned && !isUnassigned) passes = false;
        if (passes && isUnknownIban) unknownIban++;
      }

      {
        let passes = true;
        if (onlyUnassigned && !isUnassigned) passes = false;
        if (onlyUnknownIban && !isUnknownIban) passes = false;
        if (passes && isBankDeleted) deletedBank++;
      }
    }

    return { unassigned, unknownIban, deletedBank };
  }, [
    transactions,
    ibanToZahlungspartner,
    amountFilter,
    categoryFilter,
    onlyUnassigned,
    onlyUnknownIban,
    showDeletedBanks,
  ]);

  const transactionSortItems = useMemo(
    () => [
      {
        label: "Datum",
        value: "date",
        compareFn: (a: Transaction, b: Transaction) => {
          const timeA = a.daten.buchungsdatum ? new Date(a.daten.buchungsdatum).getTime() : 0;
          const timeB = b.daten.buchungsdatum ? new Date(b.daten.buchungsdatum).getTime() : 0;
          return timeA - timeB;
        },
      },
      {
        label: "Betrag",
        value: "amount",
        compareFn: (a: Transaction, b: Transaction) => a.betrag.wert - b.betrag.wert,
      },
      {
        label: "Empfänger",
        value: "name",
        compareFn: (a: Transaction, b: Transaction) =>
          a.zahlungspartner.name.localeCompare(b.zahlungspartner.name),
      },
    ],
    [],
  );

  useEffect(() => {
    if (pendingCategoryFocusId === null) return;

    const trigger = categoryTriggerRefs.current.get(pendingCategoryFocusId);
    if (!trigger) return;

    trigger.focus();
    trigger.scrollIntoView({ block: "center" });
    setPendingCategoryFocusId(null);
  }, [pendingCategoryFocusId, visibleTransactions, expandedTransactionId]);

  const saveTransactionCategory = async (id: number, categoryId: number | null) => {
    try {
      await updateTransactionCategory(id, categoryId);
      await reload();
      toast.success("Kategorie gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kategorie konnte nicht gespeichert werden");
    }
  };

  const saveTransactionNote = async (id: number, note: string | null) => {
    try {
      await updateTransactionNote(id, note);
      await reload();
      toast.success("Anmerkung gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anmerkung konnte nicht gespeichert werden");
      throw err;
    }
  };

  const saveTransactionSplits = async (
    id: number,
    splits: { betrag: number; kategorieId: number | null }[] | null,
  ) => {
    try {
      await updateTransactionSplits(id, splits);
      await reload();
      toast.success("Splits gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Splits konnten nicht gespeichert werden");
    }
  };

  const linkIbanToZahlungspartner = async (iban: string, zahlungspartnerId: number) => {
    try {
      await updateIbanZahlungspartnerMapping(iban, zahlungspartnerId);
      await loadZahlungspartnerData({ forceRefresh: true });
      toast.success("IBAN verknüpft");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "IBAN konnte nicht verknüpft werden");
      throw err;
    }
  };

  const createZahlungspartnerForIban = async (iban: string, name: string) => {
    try {
      const owner = await createZahlungspartner({
        name: name.trim(),
        website: null,
        logo_url: null,
        logo_white_background: false,
        logo_padding: false,
        is_company: true,
      });
      await updateIbanZahlungspartnerMapping(iban, owner.id);
      await loadZahlungspartnerData({ forceRefresh: true });
      toast.success("Zahlungspartner erstellt und IBAN verknüpft");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Zahlungspartner konnte nicht erstellt werden");
      throw err;
    }
  };

  const toggleRow = (id: number) => {
    if (
      expandedTransactionId !== null &&
      expandedTransactionId !== id &&
      visibleTransactions.length > 0
    ) {
      const currentTransaction = visibleTransactions.find((t) => t.id === expandedTransactionId);
      if (currentTransaction && expandedNoteDraft.current !== currentTransaction.texte.anmerkung) {
        setPendingToggleId(id);
        setToggleConfirmOpen(true);
        return;
      }
    }
    setExpandedTransactionId((current) => (current === id ? null : id));
  };

  const handleToggleConfirmSave = async () => {
    if (expandedTransactionId !== null) {
      try {
        await saveTransactionNote(expandedTransactionId, expandedNoteDraft.current || null);
      } catch {
        return;
      }
    }
    setToggleConfirmOpen(false);
    if (pendingToggleId !== null) {
      setExpandedTransactionId(pendingToggleId);
      setPendingToggleId(null);
    }
  };

  const handleToggleConfirmDiscard = () => {
    expandedNoteDraft.current =
      visibleTransactions.find((t) => t.id === expandedTransactionId)?.texte.anmerkung ?? "";
    setToggleConfirmOpen(false);
    if (pendingToggleId !== null) {
      setExpandedTransactionId(pendingToggleId);
      setPendingToggleId(null);
    }
  };

  const openDeleteTransactionDialog = (transaction: Transaction) => {
    setTransactionToDelete(transaction);
  };

  const moveCategoryFocus = (currentId: number, direction: 1 | -1) => {
    const currentIndex = visibleTransactions.findIndex(
      (transaction) => transaction.id === currentId,
    );
    if (currentIndex < 0) return;

    const step = direction;
    let i = currentIndex + step;
    while (i >= 0 && i < visibleTransactions.length) {
      const t = visibleTransactions[i];
      if (t.technisch.kategorieId == null) {
        setExpandedTransactionId(t.id);
        virtualListRef.current?.scrollToItem(t.id);
        requestAnimationFrame(() => {
          const trigger = categoryTriggerRefs.current.get(t.id);
          if (trigger) {
            trigger.focus();
          }
        });
        setPendingCategoryFocusId(null);
        return;
      }
      i += step;
    }
  };

  const handleRowKeyDown = (event: KeyboardEvent<Element>, currentId: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    event.stopPropagation();

    moveCategoryFocus(currentId, event.key === "ArrowDown" ? 1 : -1);
  };

  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;

    setDeletingTransaction(true);

    try {
      await deleteTransaction(transactionToDelete.id);
      if (expandedTransactionId === transactionToDelete.id) {
        setExpandedTransactionId(null);
      }
      await reload();
      setTransactionToDelete(null);
      toast.success("Transaktion gelöscht");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transaktion konnte nicht gelöscht werden");
    } finally {
      setDeletingTransaction(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const currentCategoryId = transaction.technisch.kategorieId;
      const isUnassigned = currentCategoryId == null;
      const isIncome = transaction.betrag.wert >= 0;
      const partnerIban = normalizeIban(transaction.zahlungspartner.iban);
      const unknownIban = partnerIban.length > 0 && !ibanToZahlungspartner.has(partnerIban);

      if (!showDeletedBanks && transaction.technisch.bankDeleted) return false;
      if (onlyUnassigned && !isUnassigned) return false;
      if (onlyUnknownIban && !unknownIban) return false;
      if (amountFilter === "income" && !isIncome) return false;
      if (amountFilter === "expense" && isIncome) return false;
      if (categoryFilter !== "all" && String(currentCategoryId ?? "") !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [
    amountFilter,
    categoryFilter,
    ibanToZahlungspartner,
    onlyUnassigned,
    onlyUnknownIban,
    showDeletedBanks,
    transactions,
  ]);

  const {
    selectedTransactionIds,
    selectedCount,
    handleSelectChange,
    isAllVisibleSelected,
    handleSelectAllVisible,
    clearSelection,
  } = useSelection(visibleTransactions);

  const {
    batchDeleteOpen,
    setBatchDeleteOpen,
    deletingBatch,
    handleBatchDelete,
    batchCategoryId,
    setBatchCategoryId,
    applyingBatchCategory,
    handleBatchCategorize,
  } = useBatchActions({
    selectedTransactionIds,
    clearSelection,
    reload,
    expandedTransactionId,
    setExpandedTransactionId,
  });

  const handleFilterTransaction = useCallback((transaction: Transaction, query: string) => {
    const searchable = [
      transaction.zahlungspartner.name,
      transaction.zahlungspartner.datenbankName,
      transaction.texte.verwendungszweck,
      transaction.texte.zusatzVerwendungszweck,
      transaction.texte.buchungstext,
      transaction.texte.anmerkung,
      transaction.zahlungspartner.iban,
      formatDate(transaction.daten.buchungsdatum),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(query.toLowerCase());
  }, []);

  if (error) {
    return (
      <EmptyState
        title="Fehler beim Laden der Transaktionen"
        text={`Fehler: ${error}`}
        illustration={<CircleX />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-6">
      <DateFilter value={dateFilter} onChange={setDateFilter} />

      <VirtualizedList
        ref={virtualListRef}
        items={filteredTransactions}
        loading={loading}
        csvExport={true}
        searchPlaceholder="Transaktionen suchen..."
        onVisibleItemsChange={setVisibleTransactions}
        sortItems={transactionSortItems}
        selectAllNode={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectAllVisible}
            height={8}
            className="text-xs"
          >
            Alle auswählen
          </Button>
        }
        footerActions={
          selectedCount > 0
            ? [
                <BatchActionsBar
                  key="batch-actions"
                  selectedCount={selectedCount}
                  isAllVisibleSelected={isAllVisibleSelected}
                  onSelectAll={handleSelectAllVisible}
                  batchCategoryId={batchCategoryId}
                  onBatchCategoryChange={setBatchCategoryId}
                  categoryOptions={categoryOptions}
                  onBatchCategorize={handleBatchCategorize}
                  applyingBatchCategory={applyingBatchCategory}
                  onBatchDelete={() => setBatchDeleteOpen(true)}
                  onClearSelection={clearSelection}
                />,
              ]
            : undefined
        }
        filterItems={[
          <TransactionsFilterBar
            key="transactions-filters"
            onlyUnassigned={onlyUnassigned}
            onlyUnknownIban={onlyUnknownIban}
            showDeletedBanks={showDeletedBanks}
            unassignedCount={filterCounts.unassigned}
            unknownIbanCount={filterCounts.unknownIban}
            deletedBankCount={filterCounts.deletedBank}
            amountFilter={amountFilter}
            categoryFilter={categoryFilter}
            categoryOptions={categoryFilterOptions}
            onToggleOnlyUnassigned={() => setOnlyUnassigned((current) => !current)}
            onToggleOnlyUnknownIban={() => setOnlyUnknownIban((current) => !current)}
            onToggleShowDeletedBanks={() => setShowDeletedBanks((current) => !current)}
            onAmountFilterChange={setAmountFilter}
            onCategoryFilterChange={setCategoryFilter}
          />,
        ]}
        filterItem={handleFilterTransaction}
        getItemKey={(transaction) => transaction.id}
        getItemHeight={(transaction) => {
          if (expandedTransactionId !== transaction.id) return 88;
          const splitHeight = transaction.technisch.splits
            ? transaction.technisch.splits.length * 52 + 80
            : 0;
          const baseHeight =
            normalizeIban(transaction.zahlungspartner.iban) &&
            !ibanToZahlungspartner.has(normalizeIban(transaction.zahlungspartner.iban))
              ? 604
              : 468;
          return baseHeight + splitHeight;
        }}
        renderItem={(transaction) => {
          const accountBank = linkedAccountByIban.get(normalizeIban(transaction.konto.iban));
          const partnerBank = linkedAccountByIban.get(
            normalizeIban(transaction.zahlungspartner.iban),
          );
          const currentCategoryId = transaction.technisch.kategorieId;
          const prediction = predictionsMap.get(transaction.id) ?? null;
          const predictedCategoryId = prediction?.categoryId ?? null;
          const predictedSimilarity = prediction?.similarity ?? null;
          const partnerIban = normalizeIban(transaction.zahlungspartner.iban);
          const hasUnknownIban = partnerIban.length > 0 && !ibanToZahlungspartner.has(partnerIban);
          const ownerId = ibanToZahlungspartner.get(partnerIban);

          return (
            <TransactionRow
              transaction={transaction}
              isExpanded={expandedTransactionId === transaction.id}
              isUnassigned={currentCategoryId == null}
              isSelected={selectedTransactionIds.has(transaction.id)}
              predictedCategoryId={predictedCategoryId}
              predictedSimilarity={predictedSimilarity}
              accountBank={accountBank ?? null}
              partnerBank={partnerBank ?? null}
              selectedBank={selectedBank}
              categoryOptions={categoryOptions}
              zahlungspartnerOptions={zahlungspartner}
              currentCategoryId={currentCategoryId}
              unknownIban={hasUnknownIban ? partnerIban : null}
              ownerId={ownerId}
              onToggleRow={toggleRow}
              onRowKeyDown={handleRowKeyDown}
              onSelectChange={handleSelectChange}
              onSaveCategory={(transactionId, categoryId) => {
                void saveTransactionCategory(transactionId, categoryId);
              }}
               onSaveNote={saveTransactionNote}
               onSaveSplits={saveTransactionSplits}
               onNoteDraftChange={(draft) => {
                if (expandedTransactionId === transaction.id) {
                  expandedNoteDraft.current = draft;
                }
              }}
              onLinkIbanToZahlungspartner={linkIbanToZahlungspartner}
              onCreateZahlungspartnerForIban={createZahlungspartnerForIban}
              onDelete={openDeleteTransactionDialog}
              categoryTriggerRef={(node) => {
                categoryTriggerRefs.current.set(transaction.id, node);
              }}
            />
          );
        }}
      />

      <ConfirmDialog
        open={Boolean(transactionToDelete)}
        title="Transaktion löschen"
        description={`Transaktion vom ${transactionToDelete ? formatDate(transactionToDelete.daten.buchungsdatum) : ""} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        loading={deletingTransaction}
        onOpenChange={(open) => {
          if (!open) setTransactionToDelete(null);
        }}
        onConfirm={confirmDeleteTransaction}
      />

      <ConfirmDialog
        open={batchDeleteOpen}
        title={`${selectedCount} Transaktionen löschen`}
        description={`${selectedCount} ausgewählte Transaktionen wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Alle löschen"
        loading={deletingBatch}
        onOpenChange={(open) => {
          if (!open) setBatchDeleteOpen(false);
        }}
        onConfirm={handleBatchDelete}
      />

      <ConfirmDialog
        open={toggleConfirmOpen}
        title="Ungespeicherte Änderungen"
        description="Die Anmerkung wurde noch nicht gespeichert. Was möchtest du tun?"
        confirmLabel="Verwerfen"
        saveLabel="Speichern"
        cancelLabel="Abbrechen"
        destructive={false}
        onSave={() => void handleToggleConfirmSave()}
        onConfirm={handleToggleConfirmDiscard}
        onOpenChange={(open) => {
          if (open) return;
          setToggleConfirmOpen(false);
          setPendingToggleId(null);
        }}
      />
    </div>
  );
}
