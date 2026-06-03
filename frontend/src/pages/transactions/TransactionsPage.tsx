"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CircleX } from "lucide-react";
import { toast } from "sonner";

import DateFilter from "@/components/date-filter";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  VirtualizedList,
  type VirtualizedListRef,
} from "@/components/virtualized-list";

import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useTransactionsData } from "@/hooks/useTransactionsData";

import {
  fetchCategories,
  triggerAutoCategorize,
  updateTransactionCategory,
  type FinanceCategory,
} from "@/lib/categories";
import {
  createKontoinhaber,
  deleteTransaction,
  fetchKontoinhaberReferenceData,
  type KontoinhaberRecord,
  updateTransactionNote,
  updateIbanKontoinhaberMapping,
} from "@/lib/db";

import { type Transaction } from "@/types/transaction";

import { TransactionRow } from "./TransactionRow";
import { TransactionsFilterBar } from "./TransactionsFilterBar";
import { BatchActionsBar } from "./BatchActionsBar";
import { useSelection } from "./useSelection";
import { useBatchActions } from "./useBatchActions";
import {
  buildCategoryOptions,
  buildLinkedAccountLookup,
  formatDate,
  normalizeIban,
  type TransactionCategoryOption,
} from "./transactions.utils";

export default function TransactionsPage() {
  const { dateFilter, setDateFilter } = useGlobalDateFilter();

  const {
    loading,
    error,
    transactions = [],
    reload,
    linkedAccounts = [],
    selectedBank = null,
  } = useTransactionsData(dateFilter);

  const [ibanToKontoinhaber, setIbanToKontoinhaber] = useState<
    Map<string, number>
  >(new Map());
  const [kontoinhaber, setKontoinhaber] = useState<KontoinhaberRecord[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [predictionsMap, setPredictionsMap] = useState<
    Map<number, { categoryId: number; similarity: number }>
  >(new Map());
  const [expandedTransactionId, setExpandedTransactionId] = useState<
    number | null
  >(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyUnknownIban, setOnlyUnknownIban] = useState(false);
  const [showDeletedBanks, setShowDeletedBanks] = useState(false);
  const [amountFilter, setAmountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibleTransactions, setVisibleTransactions] = useState<Transaction[]>(
    [],
  );
  const [pendingCategoryFocusId, setPendingCategoryFocusId] = useState<
    number | null
  >(null);
  const [transactionToDelete, setTransactionToDelete] =
    useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState(false);
  const categoryTriggerRefs = useRef(
    new Map<number, HTMLButtonElement | null>(),
  );
  const virtualListRef = useRef<VirtualizedListRef>(null);

  const loadKontoinhaberData = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      try {
        const data = await fetchKontoinhaberReferenceData(options);

        const nameById = new Map<number, string>();
        data.kontoinhaber.forEach((owner) => {
          nameById.set(owner.id, owner.name);
        });

        const lookup = new Map<string, number>();
        data.iban_mappings.forEach((mapping) => {
          const iban = normalizeIban(mapping.iban);
          if (iban) {
            lookup.set(iban, mapping.f_kontoinhaber_id);
          }
        });

        setKontoinhaber(data.kontoinhaber);
        setIbanToKontoinhaber(lookup);
      } catch {
        setKontoinhaber([]);
        setIbanToKontoinhaber(new Map());
      }
    },
    [],
  );

  useEffect(() => {
    void loadKontoinhaberData();
  }, [loadKontoinhaberData]);

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
        const map = new Map<
          number,
          { categoryId: number; similarity: number }
        >();
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

  const categoryOptions = useMemo(
    () => buildCategoryOptions(categories),
    [categories],
  );

  const categoryFilterOptions = useMemo<TransactionCategoryOption[]>(
    () => [
      { value: "all", label: "Alle Kategorien", icon: null, depth: 0 },
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
      const isUnknownIban =
        partnerIban.length > 0 && !ibanToKontoinhaber.has(partnerIban);
      const isSaldoCorrection =
        transaction.technisch.transactionCode == "MANUAL_BALANCE_ADJUSTMENT";
      const isBankDeleted = transaction.technisch.bankDeleted;

      if (isSaldoCorrection) continue;

      if (amountFilter === "income" && !isIncome) continue;
      if (amountFilter === "expense" && isIncome) continue;
      if (
        categoryFilter !== "all" &&
        String(kategorieId ?? "") !== categoryFilter
      ) {
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
    ibanToKontoinhaber,
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
          const timeA = a.daten.buchungsdatum
            ? new Date(a.daten.buchungsdatum).getTime()
            : 0;
          const timeB = b.daten.buchungsdatum
            ? new Date(b.daten.buchungsdatum).getTime()
            : 0;
          return timeA - timeB;
        },
      },
      {
        label: "Betrag",
        value: "amount",
        compareFn: (a: Transaction, b: Transaction) =>
          a.betrag.wert - b.betrag.wert,
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

  const saveTransactionCategory = async (
    id: number,
    categoryId: number | null,
  ) => {
    try {
      await updateTransactionCategory(id, categoryId);
      await reload();
      toast.success("Kategorie gespeichert");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Kategorie konnte nicht gespeichert werden",
      );
    }
  };

  const saveTransactionNote = async (id: number, note: string | null) => {
    try {
      await updateTransactionNote(id, note);
      await reload();
      toast.success("Anmerkung gespeichert");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Anmerkung konnte nicht gespeichert werden",
      );
      throw err;
    }
  };

  const linkIbanToKontoinhaber = async (
    iban: string,
    kontoinhaberId: number,
  ) => {
    try {
      await updateIbanKontoinhaberMapping(iban, kontoinhaberId);
      await loadKontoinhaberData({ forceRefresh: true });
      toast.success("IBAN verknüpft");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "IBAN konnte nicht verknüpft werden",
      );
      throw err;
    }
  };

  const createKontoinhaberForIban = async (iban: string, name: string) => {
    try {
      const owner = await createKontoinhaber({
        name: name.trim(),
        website: null,
        logo_url: null,
        logo_white_background: false,
        logo_padding: false,
        is_company: true,
      });
      await updateIbanKontoinhaberMapping(iban, owner.id);
      await loadKontoinhaberData({ forceRefresh: true });
      toast.success("Kontoinhaber erstellt und IBAN verknüpft");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Kontoinhaber konnte nicht erstellt werden",
      );
      throw err;
    }
  };

  const toggleRow = (id: number) => {
    console.log("kategorie", id);
    setExpandedTransactionId((current) => (current === id ? null : id));
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
        virtualListRef.current?.scrollToIndex(i, "start");
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

  const handleRowKeyDown = (
    event: KeyboardEvent<Element>,
    currentId: number,
  ) => {
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
      toast.error(
        err instanceof Error
          ? err.message
          : "Transaktion konnte nicht gelöscht werden",
      );
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
      const unknownIban =
        partnerIban.length > 0 && !ibanToKontoinhaber.has(partnerIban);
      const isSaldoCorrection =
        transaction.technisch.transactionCode == "MANUAL_BALANCE_ADJUSTMENT";

      if (isSaldoCorrection) return false;
      if (!showDeletedBanks && transaction.technisch.bankDeleted) return false;
      if (onlyUnassigned && !isUnassigned) return false;
      if (onlyUnknownIban && !unknownIban) return false;
      if (amountFilter === "income" && !isIncome) return false;
      if (amountFilter === "expense" && isIncome) return false;
      if (
        categoryFilter !== "all" &&
        String(currentCategoryId ?? "") !== categoryFilter
      ) {
        return false;
      }

      return true;
    });
  }, [
    amountFilter,
    categoryFilter,
    ibanToKontoinhaber,
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

  const handleFilterTransaction = useCallback(
    (transaction: Transaction, query: string) => {
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
    },
    [],
  );

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
            onToggleOnlyUnassigned={() =>
              setOnlyUnassigned((current) => !current)
            }
            onToggleOnlyUnknownIban={() =>
              setOnlyUnknownIban((current) => !current)
            }
            onToggleShowDeletedBanks={() =>
              setShowDeletedBanks((current) => !current)
            }
            onAmountFilterChange={setAmountFilter}
            onCategoryFilterChange={setCategoryFilter}
          />,
        ]}
        filterItem={handleFilterTransaction}
        getItemKey={(transaction) => transaction.id}
        getItemHeight={(transaction) =>
          expandedTransactionId === transaction.id
            ? normalizeIban(transaction.zahlungspartner.iban) &&
              !ibanToKontoinhaber.has(
                normalizeIban(transaction.zahlungspartner.iban),
              )
              ? 604
              : 468
            : 88
        }
        renderItem={(transaction) => {
          const accountBank = linkedAccountByIban.get(
            normalizeIban(transaction.konto.iban),
          );
          const partnerBank = linkedAccountByIban.get(
            normalizeIban(transaction.zahlungspartner.iban),
          );
          const currentCategoryId = transaction.technisch.kategorieId;
          const prediction = predictionsMap.get(transaction.id) ?? null;
          const predictedCategoryId = prediction?.categoryId ?? null;
          const predictedSimilarity = prediction?.similarity ?? null;
          const partnerIban = normalizeIban(transaction.zahlungspartner.iban);
          const hasUnknownIban =
            partnerIban.length > 0 && !ibanToKontoinhaber.has(partnerIban);
          const ownerId = ibanToKontoinhaber.get(partnerIban);

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
              kontoinhaberOptions={kontoinhaber}
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
              onLinkIbanToKontoinhaber={linkIbanToKontoinhaber}
              onCreateKontoinhaberForIban={createKontoinhaberForIban}
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
    </div>
  );
}
