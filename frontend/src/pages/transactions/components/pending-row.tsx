import { Clock } from "lucide-react";

import { BankLogo, BrandIcon } from "@/components/bank-logo";
import { logoBackgroundClass } from "@/lib/bank/zahlungspartner-logo";
import { type SelectedBankOption } from "@/lib/bank/selected";
import { formatAmount, formatDate } from "@/lib/utils/format";
import { type Transaction } from "@/types/transaction";

type PendingRowProps = {
  transaction: Transaction;
  accountBank: SelectedBankOption | null;
};

export function PendingRow({ transaction, accountBank }: PendingRowProps) {
  const purpose =
    transaction.texte.verwendungszweck || transaction.texte.zusatzVerwendungszweck || "";

  return (
    <div className="flex w-full items-center border-b border-muted/60 bg-background text-left opacity-60 py-1">
      <div className="shrink-0 pl-5 pr-4">
        <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>

      {accountBank ? (
        <div className="flex items-center gap-2 pl-2">
          <BankLogo
            src={accountBank.bankLogo || undefined}
            srcDark={accountBank.bankLogoDark || undefined}
            alt={accountBank.accountName || accountBank.bankName || "Bank"}
            sizeClassName="size-12 shrink-0 p-1"
            backgroundClassName={
              accountBank.archived
                ? "border-amber-300 bg-amber-100 dark:border-amber-800 dark:bg-amber-950"
                : "bg-muted/70"
            }
            archived={accountBank.archived}
          />
        </div>
      ) : (
        <div className="pl-2">
          <BrandIcon
            src={transaction.zahlungspartner.logoUrl || undefined}
            alt={transaction.zahlungspartner.name || "Bank"}
            sizeClassName="size-12 shrink-0"
            backgroundClassName={logoBackgroundClass(transaction.zahlungspartner.logoBackground)}
            kind={transaction.zahlungspartner.isCompany ? "company" : "person"}
            imgNoPadding={!transaction.zahlungspartner.logoPadding}
          />
        </div>
      )}

      <div className="min-w-0 flex-1 px-2 py-3">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {transaction.zahlungspartner.name || "Unbekannt"}
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
            <Clock className="size-2.5" />
            Vorgemerkt
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 overflow-ellipsis">
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDate(transaction.daten.buchungsdatum || transaction.daten.erstelltAm)}
          </span>
          {purpose ? (
            <>
              <span className="shrink-0 text-xs text-muted-foreground/40">·</span>
              <span className="min-w-0 max-w-[500px] truncate text-xs text-muted-foreground">
                {purpose}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <span className="shrink-0 pr-11 text-sm font-semibold tabular-nums font-mono text-muted-foreground">
        {formatAmount(transaction.betrag.wert, transaction.betrag.waehrung)}
      </span>
    </div>
  );
}
