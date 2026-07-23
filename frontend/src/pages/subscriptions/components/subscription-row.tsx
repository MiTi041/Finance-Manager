import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Loader2, Pencil, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BrandIcon } from "@/components/bank-logo";
import { HelpButton } from "@/components/ui/help-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { type Subscription } from "@/pages/subscriptions/hooks/use-subscriptions";
import { getServerBaseUrl } from "@/lib/bank/zahlungspartner-logo";
import { type ZahlungspartnerRecord } from "@/lib/zahlungspartner";
import { formatAmount, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

type Props = {
  subscription: Subscription;
  isExpanded: boolean;
  onToggle: () => void;
  zahlungspartnerOptions: ZahlungspartnerRecord[];
  onLinkIdentity: (
    counterpartyName: string,
    amount: number,
    zahlungspartnerId: number,
  ) => Promise<void>;
  onCreateAndLinkIdentity: (
    counterpartyName: string,
    amount: number,
    name: string,
  ) => Promise<void>;
  onDismissIdentity: (counterpartyName: string, amount: number) => Promise<void>;
  onRemoveIdentity: (counterpartyName: string, amount: number) => Promise<void>;
  onRestoreSubscription?: (identityId: number) => Promise<void>;
};

export function SubscriptionRow({
  subscription,
  isExpanded,
  onToggle,
  zahlungspartnerOptions,
  onLinkIdentity,
  onCreateAndLinkIdentity,
  onDismissIdentity,
  onRemoveIdentity,
  onRestoreSubscription,
}: Props) {
  const hasOverride =
    subscription._counterpartyName !== undefined &&
    subscription._counterpartyName !== subscription.name;

  const nextDate = new Date(subscription.nextDate);
  const daysUntil = Math.ceil((nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const rawLogo = subscription.recipientLogo;
  const logoUrl = rawLogo?.startsWith("/")
    ? `${getServerBaseUrl()}${rawLogo}`
    : rawLogo || undefined;
  const displayName = subscription.datenbankName || subscription.name || "–";

  const counterpartyKey = subscription._counterpartyName || subscription.name;

  const [selectedZahlungspartnerId, setSelectedZahlungspartnerId] = useState("");
  const [newZahlungspartnerName, setNewZahlungspartnerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      setSelectedZahlungspartnerId("");
      setNewZahlungspartnerName("");
      setShowAllTransactions(false);
    }
  }, [subscription.name, subscription.amount, subscription._counterpartyName, isExpanded]);

  const handleLink = async () => {
    if (!selectedZahlungspartnerId || saving) return;
    setSaving(true);
    try {
      await onLinkIdentity(counterpartyKey, subscription.amount, Number(selectedZahlungspartnerId));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAndLink = async () => {
    const name = newZahlungspartnerName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await onCreateAndLinkIdentity(counterpartyKey, subscription.amount, name);
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onDismissIdentity(counterpartyKey, subscription.amount);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onRemoveIdentity(counterpartyKey, subscription.amount);
    } finally {
      setSaving(false);
    }
  };

  const lastRefundAmount = Math.max(0, subscription.lastRefundAmount);
  const hasRefunds = lastRefundAmount > 0;

  const paidInPeriod = useMemo(() => {
    const now = new Date();
    const periodMonths = subscription.frequency === "MONTHLY" ? 1 : subscription.frequency === "SEMI_ANNUAL" ? 6 : 12;
    const cutoff = new Date(now.getFullYear(), now.getMonth() - periodMonths + 1, 1);

    for (const t of subscription.transactions) {
      const dateStr = t.date?.split(" ")[0]?.split("T")[0];
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) continue;
      if (d >= cutoff) return true;
    }
    return false;
  }, [subscription.transactions, subscription.frequency]);

  const paidLabel = subscription.frequency === "MONTHLY" ? "Diesen Monat gezahlt"
    : subscription.frequency === "SEMI_ANNUAL" ? "Dieses Halbjahr gezahlt"
    : "Dieses Jahr gezahlt";

  const isDismissed = subscription.dismissed;

  const handleRestore = async () => {
    if (!onRestoreSubscription || !subscription.subscriptionIdentityId || saving) return;
    setSaving(true);
    try {
      await onRestoreSubscription(subscription.subscriptionIdentityId);
    } finally {
      setSaving(false);
    }
  };

  const handleRowClick = isDismissed ? undefined : onToggle;

  return (
    <div className="w-full">
      <div className={cn(
        "flex w-full items-center border-b border-muted/60 text-left transition-colors",
        isDismissed
          ? "bg-muted/40 hover:bg-muted/60"
          : "bg-background hover:bg-muted/40",
      )}>
        <div
          className="flex w-full items-center gap-4 px-4 py-3"
          onClick={isDismissed ? undefined : handleRowClick}
          role={isDismissed ? undefined : "button"}
          tabIndex={isDismissed ? -1 : 0}
          onKeyDown={isDismissed ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick?.(); } }}
        >
          <BrandIcon
            src={logoUrl}
            alt={subscription.name}
            sizeClassName="size-12 shrink-0"
            backgroundClassName={subscription.logoWhiteBackground ? "bg-white" : "bg-zinc-900"}
            kind={subscription.isCompany === false ? "person" : "company"}
            imgNoPadding={!subscription.logoPadding}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={cn("truncate text-sm font-medium", isDismissed ? "text-muted-foreground" : "text-foreground")}>
                {displayName}
                {displayName !== subscription.name && subscription.name ? (
                  <span className="ml-1 text-xs text-muted-foreground">{subscription.name}</span>
                ) : null}
              </p>
              {isDismissed ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Ausgeblendet
                </span>
              ) : (
                <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] leading-4">
                  {subscription.frequencyLabel}
                </Badge>
              )}
              {paidInPeriod && !isDismissed && (
                <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                  <Check className="size-3" />
                  {paidLabel}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                Nächste: {new Intl.DateTimeFormat("de-DE").format(nextDate)}
              </span>
              {daysUntil >= 0 && daysUntil <= 7 && !isDismissed && (
                <Badge variant="destructive" className="px-1.5 py-0 text-[10px] leading-4">
                  in {daysUntil} {daysUntil === 1 ? "Tag" : "Tagen"}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {isDismissed ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={(e) => { e.stopPropagation(); void handleRestore(); }}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Wiederherstellen
              </Button>
            ) : (
              <>
                {hasRefunds && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                        <Undo2 className="size-3" />
                        {formatAmount(lastRefundAmount)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">Rückerstattungsbetrag</TooltipContent>
                  </Tooltip>
                )}
                <span className="text-sm font-semibold tabular-nums text-destructive">
                  {formatAmount(subscription.effectiveAmount)}
                </span>
              </>
            )}
            {!isDismissed && (
              <span
                className={cn(
                  "text-muted-foreground/40 transition-transform duration-200",
                  isExpanded && "rotate-180",
                )}
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
            )}
          </div>
        </div>
      </div>

      {!isDismissed && isExpanded && (
        <div className="border-b border-muted/60 bg-muted/20 text-sm">
          <div className="flex w-full flex-col">
            <div className="flex justify-end px-4 py-2 gap-2 border-b border-muted">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void handleDismiss()}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                    Kein Abonnement
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] space-y-2 text-xs">
                  <p>Hierdurch wird die Erkennung als Abonnement für diese Buchung aufgehoben. Die Transaktionen bleiben erhalten und werden nicht gelöscht.</p>
                  <p className="text-muted-foreground">Sollte die Buchung erneut als Abonnement erkannt werden, erscheint sie wieder in dieser Liste.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid grid-cols-1 divide-y divide-border/60  sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="space-y-3 px-5 py-4">
                {hasOverride ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                      Überschriebener Zahlungspartner
                    </p>
                    <Link
                      to={`/settings?tab=zahlungspartner&ownerId=${subscription.recipientId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/70 rounded-lg hover:bg-muted/40 transition-colors justify-between">
                        <div className="flex items-center gap-4">
                          <BrandIcon
                            src={logoUrl}
                            alt={subscription.datenbankName || subscription.name || "Bank"}
                            sizeClassName="size-12 shrink-0"
                            backgroundClassName={
                              subscription.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
                            }
                            kind={subscription.isCompany ? "company" : "person"}
                            className="rounded-[5px]"
                            imgNoPadding={!subscription.logoPadding}
                          />

                          {subscription.datenbankName ? (
                            <p className="font-mono text-xs text-muted-foreground">
                              {subscription.datenbankName}
                            </p>
                          ) : null}
                        </div>
                        <Pencil className="size-4 mx-2 text-muted-foreground" />
                      </div>
                    </Link>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => void handleRemove()}
                      className="max-w-full gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <RotateCcw className="size-3.5 shrink-0" />

                      {/* Der Text-Container als inline-flex mit min-w-0 */}
                      <span className="inline-flex min-w-0 items-center">
                        <span className="shrink-0">Auf „</span>
                        <span className="truncate font-medium">
                          {subscription._counterpartyName}
                        </span>
                        <span className="shrink-0">“ zurücksetzen</span>
                      </span>
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                      Zahlungspartner ändern
                      <HelpButton>
                        <p>Lege hier fest, welcher Zahlungspartner diesem Abonnement zugeordnet werden soll. Der ausgewählte Name wird in allen Analysen sowie in den Transaktionslisten als Empfänger angezeigt.</p>
                        <p className="text-muted-foreground">Beispiel: Wird ein Abonnement über eine Privatperson abgewickelt, kannst du hier den tatsächlichen Dienstnamen (z. B. „Spotify") hinterlegen, damit dieser statt des privaten Namens in der Übersicht erscheint.</p>
                      </HelpButton>
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
                            disabled={!selectedZahlungspartnerId || saving}
                            onClick={() => void handleLink()}
                          >
                            {saving && selectedZahlungspartnerId ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Check className="size-3.5" />
                            )}
                            Verknüpfen
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-1">
                        <div className="h-px flex-1 bg-border/60" />
                        <span className="shrink-0 text-xs text-muted-foreground/40">Oder</span>
                        <div className="h-px flex-1 bg-border/60" />
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Neuen Zahlungspartner anlegen
                        </p>
                        <div className="flex gap-2 flex-wrap items-center">
                          <Input
                            value={newZahlungspartnerName}
                            onChange={(e) => setNewZahlungspartnerName(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder="Name …"
                            className="h-8 min-w-30 flex-1 rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={!newZahlungspartnerName.trim() || saving}
                            onClick={() => void handleCreateAndLink()}
                          >
                            {saving && newZahlungspartnerName.trim() ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Plus className="size-3.5" />
                            )}
                            Anlegen
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2 px-5 py-4">
                <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                  Zeitraum
                </p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Erste: {formatDate(subscription.firstDate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Letzte: {formatDate(subscription.lastDate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nächste: {formatDate(subscription.nextDate)}
                  </p>
                </div>
              </div>

              <div className="space-y-2 px-5 py-4">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                  Transaktionen ({subscription.transactionCount})
                </p>
                <div className="space-y-px">
                  {subscription.transactions
                    .slice(0, showAllTransactions ? undefined : 3)
                    .map((t) => (
                      <div
                        key={t.id}
                        className="grid grid-cols-[5rem_1fr_auto] gap-2 rounded-md py-1.5"
                      >
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatDate(t.date)}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t.purpose || "–"}
                        </span>
                        <span className="flex items-center gap-1.5">
                          {t.note ? (
                            <FileText className="size-3 shrink-0 text-muted-foreground/40" />
                          ) : null}
                          <span
                            className={cn(
                              "text-right text-xs tabular-nums",
                              t.amount < 0 ? "font-medium text-destructive" : "text-green-600",
                            )}
                          >
                            {formatAmount(t.amount)}
                          </span>
                        </span>
                      </div>
                    ))}
                </div>
                {subscription.transactions.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllTransactions(!showAllTransactions);
                    }}
                    className="mt-2 w-full cursor-pointer rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40"
                  >
                    {showAllTransactions
                      ? "Weniger anzeigen"
                      : `Noch ${subscription.transactions.length - 3} weitere anzeigen`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
