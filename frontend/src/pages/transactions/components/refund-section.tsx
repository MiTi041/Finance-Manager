import { useMemo, useState } from "react";
import { Loader2, Search, Trash2 } from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, formatDate } from "@/lib/utils/format";
import { updateRefundLink } from "@/lib/transactions";
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
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <BrandIcon
              src={linkedTransaction.zahlungspartner.logoUrl || undefined}
              alt={
                linkedTransaction.zahlungspartner.datenbankName ||
                linkedTransaction.zahlungspartner.name ||
                "?"
              }
              sizeClassName="size-8 shrink-0"
              backgroundClassName={
                linkedTransaction.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
              }
              kind={linkedTransaction.zahlungspartner.isCompany ? "company" : "person"}
              imgNoPadding={!linkedTransaction.zahlungspartner.logoPadding}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {linkedTransaction.zahlungspartner.datenbankName ||
                  linkedTransaction.zahlungspartner.name ||
                  "–"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(linkedTransaction.daten.buchungsdatum)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium tabular-nums text-red-500">
              {formatAmount(
                Math.abs(linkedTransaction.betrag.wert),
                linkedTransaction.betrag.waehrung,
              )}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={linkingId !== null}
                  onClick={() => void handleUnlink()}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  {linkingId === transaction.id ? (
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
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="flex w-full justify-start gap-2 shadow-none h-9 text-muted-foreground font-normal hover:text-foreground"
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
                    value={`${t.id}-${t.zahlungspartner.name || ""} ${formatAmount(Math.abs(t.betrag.wert), t.betrag.waehrung)} ${formatDate(t.daten.buchungsdatum)}`}
                    onSelect={() => void handleLink(t.id)}
                    disabled={linkingId === t.id}
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
      <div className="space-y-1.5">
        {refundTransactions.map((refund) => (
          <div
            key={refund.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <BrandIcon
                src={refund.zahlungspartner.logoUrl || undefined}
                alt={refund.zahlungspartner.datenbankName || refund.zahlungspartner.name || "?"}
                sizeClassName="size-8 shrink-0"
                backgroundClassName={
                  refund.zahlungspartner.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                }
                kind={refund.zahlungspartner.isCompany ? "company" : "person"}
                imgNoPadding={!refund.zahlungspartner.logoPadding}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {refund.zahlungspartner.datenbankName || refund.zahlungspartner.name || "–"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(refund.daten.buchungsdatum)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium tabular-nums text-green-500">
                +{formatAmount(Math.abs(refund.betrag.wert), refund.betrag.waehrung)}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={unlinkingId !== null}
                    onClick={() => void handleUnlink(refund.id)}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {unlinkingId === refund.id ? (
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
