import { type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Repeat, TriangleAlert, Undo2 } from "lucide-react";

import { BankLogo, BrandIcon } from "@/components/bank-logo";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type SelectedBankOption } from "@/lib/bank/selected";
import { formatAmount, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { type Transaction } from "@/types/transaction";

import {
  type SubscriptionOverride,
  useTransactionDerivations,
} from "../hooks/use-transaction-derivations";

type CollapsedRowProps = {
  transaction: Transaction;
  subscriptionOverride: SubscriptionOverride | null;
  isExpanded: boolean;
  isSelected: boolean;
  selectedBank: SelectedBankOption | null;
  accountBank: SelectedBankOption | null;
  isUnassigned: boolean;
  isSubscriptionTransaction: boolean;
  subscriptionLink: { counterpartyName: string; amount: number } | null;
  unknownIban: string | null;
  onToggleRow: (transactionId: number) => void;
  onOpenRefundSection: (transactionId: number) => void;
  onRequestClose: (closeAction: () => void) => void;
  onRowKeyDown: (event: KeyboardEvent<Element>, transactionId: number) => void;
  onSelectChange: (transactionId: number, selected: boolean) => void;
};

export function CollapsedRow({
  transaction,
  subscriptionOverride,
  isExpanded,
  isSelected,
  selectedBank,
  accountBank,
  isUnassigned,
  isSubscriptionTransaction,
  subscriptionLink,
  unknownIban,
  onToggleRow,
  onOpenRefundSection,
  onRequestClose,
  onRowKeyDown,
  onSelectChange,
}: CollapsedRowProps) {
  const {
    isRefund,
    linkedRefundTotal,
    hasRefunds,
    displayAmount,
    isEntgeltabschluss,
    overrideLogoSrc,
    partnerLogoSrc,
    displayName,
    overridePartnerName,
    deviateApplicant,
    collapsedPurpose,
  } = useTransactionDerivations(transaction, subscriptionOverride);

  const trimmedSavedNote = transaction.texte.anmerkung.trim();

  return (
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
            ? onRequestClose(() => onToggleRow(transaction.id))
            : onToggleRow(transaction.id)
        }
        onKeyDown={(event) => {
          if (isExpanded && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            onRequestClose(() => onRowKeyDown(event, transaction.id));
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
                src={overrideLogoSrc || partnerLogoSrc}
                alt={
                  subscriptionOverride?.datenbankName ||
                  subscriptionOverride?.name ||
                  transaction.zahlungspartner.datenbankName ||
                  transaction.zahlungspartner.name ||
                  "Bank"
                }
                sizeClassName="size-12 shrink-0"
                backgroundClassName={
                  (subscriptionOverride?.logoWhiteBackground ??
                  transaction.zahlungspartner.logoWhiteBackground)
                    ? "bg-white"
                    : "bg-zinc-900"
                }
                kind={
                  (subscriptionOverride?.isCompany ?? transaction.zahlungspartner.isCompany)
                    ? "company"
                    : "person"
                }
                imgNoPadding={
                  !(subscriptionOverride?.logoPadding ?? transaction.zahlungspartner.logoPadding)
                }
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate text-sm font-medium text-foreground flex gap-2 items-end">
                  {displayName}
                  {overridePartnerName ? (
                    <span className="text-xs text-muted-foreground">{overridePartnerName}</span>
                  ) : displayName !== transaction.zahlungspartner.name ? (
                    <span className="text-xs text-muted-foreground">
                      {transaction.zahlungspartner.name}
                    </span>
                  ) : null}
                  {deviateApplicant !== transaction.zahlungspartner.name && deviateApplicant ? (
                    <span className="text-xs text-muted-foreground"> {deviateApplicant}</span>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="size-2 shrink-0 rounded-full bg-orange-500" />
              </TooltipTrigger>
              <TooltipContent side="top">Unkategorisiert</TooltipContent>
            </Tooltip>
          ) : null}
          {transaction.technisch.splits ? (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              Gesplittet
            </span>
          ) : null}
          {isSubscriptionTransaction ? (
            subscriptionLink ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={`/subscriptions?name=${encodeURIComponent(subscriptionLink.counterpartyName)}&amount=${subscriptionLink.amount}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
                  >
                    <Repeat className="size-3" />
                    Abonnement
                    <ExternalLink className="size-2.5 opacity-60" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="top">Abonnement-Details anzeigen</TooltipContent>
              </Tooltip>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                <Repeat className="size-3" />
                Abonnement
              </span>
            )
          ) : null}
          <span className="flex items-center gap-1.5">
            {(isRefund || hasRefunds) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenRefundSection(transaction.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenRefundSection(transaction.id);
                      }
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-500/20 transition-colors dark:text-amber-400 tabular-nums"
                  >
                    <Undo2 className="size-3" />
                    {formatAmount(
                      isRefund ? transaction.betrag.wert : linkedRefundTotal,
                      transaction.betrag.waehrung,
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Rückerstattungsbetrag</TooltipContent>
              </Tooltip>
            )}
            <span
              className={
                displayAmount < 0
                  ? "text-sm font-semibold tabular-nums text-destructive"
                  : "text-sm font-semibold tabular-nums text-green-600"
              }
            >
              {formatAmount(displayAmount, transaction.betrag.waehrung)}
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
  );
}
