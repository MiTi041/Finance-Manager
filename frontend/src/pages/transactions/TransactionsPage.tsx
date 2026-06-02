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
import { VirtualizedList } from "@/components/virtualized-list";

import { useGlobalDateFilter } from "@/hooks/use-global-date-filter";
import { useTransactionsData } from "@/hooks/useTransactionsData";

import {
  fetchCategories,
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
  const [expandedTransactionId, setExpandedTransactionId] = useState<
    number | null
  >(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyUnknownIban, setOnlyUnknownIban] = useState(false);
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
    () => [{ value: "all", label: "Alle Kategorien" }, ...categoryOptions],
    [categoryOptions],
  );

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
    trigger.scrollIntoView({ block: "nearest" });
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

    const nextTransaction = visibleTransactions[currentIndex + direction];
    if (!nextTransaction) return;

    setExpandedTransactionId(nextTransaction.id);
    setPendingCategoryFocusId(nextTransaction.id);
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLElement>,
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
      // Transaktionen die zur Saldoberichtigung dienen, sollen nicht angezeigt werden
      const isSaldoCorrection =
        transaction.technisch.transactionCode == "MANUAL_BALANCE_ADJUSTMENT";

      if (isSaldoCorrection) return false;
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
    transactions,
  ]);

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
        items={filteredTransactions}
        loading={loading}
        csvExport={true}
        searchPlaceholder="Transaktionen suchen..."
        onVisibleItemsChange={setVisibleTransactions}
        sortItems={transactionSortItems}
        filterItems={[
          <TransactionsFilterBar
            key="transactions-filters"
            onlyUnassigned={onlyUnassigned}
            onlyUnknownIban={onlyUnknownIban}
            amountFilter={amountFilter}
            categoryFilter={categoryFilter}
            categoryOptions={categoryFilterOptions}
            onToggleOnlyUnassigned={() =>
              setOnlyUnassigned((current) => !current)
            }
            onToggleOnlyUnknownIban={() =>
              setOnlyUnknownIban((current) => !current)
            }
            onAmountFilterChange={setAmountFilter}
            onCategoryFilterChange={setCategoryFilter}
          />,
        ]}
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
          const partnerIban = normalizeIban(transaction.zahlungspartner.iban);
          const hasUnknownIban =
            partnerIban.length > 0 && !ibanToKontoinhaber.has(partnerIban);
          const ownerId = ibanToKontoinhaber.get(partnerIban);

          return (
            <TransactionRow
              transaction={transaction}
              isExpanded={expandedTransactionId === transaction.id}
              isUnassigned={currentCategoryId == null}
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
    </div>
  );
}
