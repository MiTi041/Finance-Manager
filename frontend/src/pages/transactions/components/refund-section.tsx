import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import { BrandIcon } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, formatDate } from "@/lib/utils/format";
import { addRefundLink, deleteRefundLink } from "@/lib/transactions";
import { type Transaction } from "@/types/transaction";

export function RefundSectionIncoming({
  transaction,
  allTransactions,
  onRefundLinkChange,
}: {
  transaction: Transaction;
  allTransactions: Transaction[];
  onRefundLinkChange: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Transaction | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const links = transaction.refundLinks;
  const remaining = Math.max(0, transaction.betrag.wert - transaction.refundAttributed);
  const canAdd = remaining > 0.005;

  const outgoingList = useMemo(
    () => allTransactions.filter((t) => t.betrag.wert < 0),
    [allTransactions],
  );

  const expenseRemainingFor = (expense: Transaction) => {
    const refunded = allTransactions.reduce(
      (sum, t) =>
        sum +
        t.refundLinks
          .filter((link) => link.expense_transaction_id === expense.id)
          .reduce((s, link) => s + link.amount, 0),
      0,
    );
    return Math.max(0, Math.abs(expense.betrag.wert) - refunded);
  };

  const handlePick = (expense: Transaction) => {
    setSelectedExpense(expense);
    setAmountDraft(Math.min(remaining, expenseRemainingFor(expense)).toFixed(2));
    setPickerOpen(false);
    setAmountOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedExpense) return;
    const amount = Number.parseFloat(amountDraft.replace(",", "."));
    const max = Math.min(remaining, expenseRemainingFor(selectedExpense));
    if (!Number.isFinite(amount) || amount <= 0 || amount > max + 0.005) return;
    setSubmitting(true);
    try {
      await addRefundLink(transaction.id, selectedExpense.id, amount);
      setAmountOpen(false);
      setSelectedExpense(null);
      onRefundLinkChange();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (linkId: number) => {
    setRemovingId(linkId);
    try {
      await deleteRefundLink(transaction.id, linkId);
      onRefundLinkChange();
    } finally {
      setRemovingId(null);
    }
  };

  const amountValid = selectedExpense
    ? (() => {
        const amount = Number.parseFloat(amountDraft.replace(",", "."));
        const max = Math.min(remaining, expenseRemainingFor(selectedExpense));
        return Number.isFinite(amount) && amount > 0 && amount <= max + 0.005;
      })()
    : false;

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Diese Gutschrift ist eine Rückerstattung für
      </p>

      {links.length > 0 && (
        <div className="space-y-1.5">
          {links.map((link) => {
            const expense = allTransactions.find((t) => t.id === link.expense_transaction_id);
            return (
              <div
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BrandIcon
                    src={expense?.zahlungspartner.logoUrl || undefined}
                    alt={expense?.zahlungspartner.datenbankName || expense?.zahlungspartner.name || "?"}
                    sizeClassName="size-8 shrink-0"
                    backgroundClassName={
                      expense?.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                    }
                    kind={expense?.zahlungspartner.isCompany ? "company" : "person"}
                    imgNoPadding={!expense?.zahlungspartner.logoPadding}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {expense?.zahlungspartner.datenbankName ||
                        expense?.zahlungspartner.name ||
                        "–"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {expense ? formatDate(expense.daten.buchungsdatum) : "–"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium tabular-nums text-green-500">
                    +{formatAmount(link.amount, transaction.betrag.waehrung)}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={removingId !== null}
                        onClick={() => void handleRemove(link.id)}
                        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {removingId === link.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Verknüpfung entfernen</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">
          Rest: {formatAmount(remaining, transaction.betrag.waehrung)}
        </span>
        {canAdd && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="shadow-none h-9 text-muted-foreground font-normal hover:text-foreground"
          >
            <Plus className="size-3.5 shrink-0 opacity-50" />
            <span>Rückerstattung hinzufügen</span>
          </Button>
        )}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
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
                    value={`${t.id}-${t.zahlungspartner.name || ""} ${formatAmount(Math.abs(t.betrag.wert), t.betrag.waehrung)} ${formatDate(t.daten.buchungsdatum)}`}
                    onSelect={() => handlePick(t)}
                    className="cursor-pointer"
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
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      <Dialog open={amountOpen} onOpenChange={setAmountOpen}>
        <DialogContent className="p-0 gap-0 max-w-sm" showCloseButton={false}>
          <DialogHeader className="p-5 pb-2">
            <DialogTitle>Betrag der Rückerstattung</DialogTitle>
            <DialogDescription>
              Wie viel der {formatAmount(transaction.betrag.wert, transaction.betrag.waehrung)} entfällt auf{" "}
              {selectedExpense?.zahlungspartner.datenbankName || selectedExpense?.zahlungspartner.name || "diese Ausgabe"}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-5 pt-2">
            <Input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              autoFocus
            />
            {selectedExpense && (
              <p className="text-xs text-muted-foreground">
                Maximal {formatAmount(Math.min(remaining, expenseRemainingFor(selectedExpense)), transaction.betrag.waehrung)} —
                Rest der Gutschrift und Rest der Ausgabe
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAmountOpen(false)}>
                Abbrechen
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!amountValid || submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Speichern
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RefundSectionOutgoing({
  transaction,
  allTransactions,
  onRefundLinkChange,
}: {
  transaction: Transaction;
  allTransactions: Transaction[];
  onRefundLinkChange: () => void;
}) {
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);

  const refundLinks = useMemo(
    () =>
      allTransactions
        .flatMap((t) => t.refundLinks.map((link) => ({ ...link, income: t })))
        .filter((link) => link.expense_transaction_id === transaction.id),
    [allTransactions, transaction.id],
  );

  const handleUnlink = async (linkId: number) => {
    setUnlinkingId(linkId);
    try {
      await deleteRefundLink(refundLinks.find((l) => l.id === linkId)?.income.id ?? transaction.id, linkId);
      onRefundLinkChange();
    } finally {
      setUnlinkingId(null);
    }
  };

  if (refundLinks.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
        Rückerstattungen für diese Ausgabe
      </p>
      <div className="space-y-1.5">
        {refundLinks.map((link) => (
          <div
            key={link.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <BrandIcon
                src={link.income.zahlungspartner.logoUrl || undefined}
                alt={link.income.zahlungspartner.datenbankName || link.income.zahlungspartner.name || "?"}
                sizeClassName="size-8 shrink-0"
                backgroundClassName={
                  link.income.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                }
                kind={link.income.zahlungspartner.isCompany ? "company" : "person"}
                imgNoPadding={!link.income.zahlungspartner.logoPadding}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {link.income.zahlungspartner.datenbankName || link.income.zahlungspartner.name || "–"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(link.income.daten.buchungsdatum)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium tabular-nums text-green-500">
                +{formatAmount(link.amount, transaction.betrag.waehrung)}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={unlinkingId !== null}
                    onClick={() => void handleUnlink(link.id)}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {unlinkingId === link.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Verknüpfung entfernen</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
