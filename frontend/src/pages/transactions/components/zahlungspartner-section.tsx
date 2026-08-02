import { Link } from "react-router-dom";
import { Check, CircleAlert, Loader2, Pencil } from "lucide-react";

import { BankLogo, BrandIcon } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/ui/help-button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { type SelectedBankOption } from "@/lib/bank/selected";
import { type ZahlungspartnerRecord } from "@/lib/zahlungspartner";
import { type Transaction } from "@/types/transaction";

import { useIbanLinking } from "../hooks/use-iban-linking";
import {
  type SubscriptionOverride,
  useTransactionDerivations,
} from "../hooks/use-transaction-derivations";

const ING_BLZ = "50010517";

type ZahlungspartnerSectionProps = {
  transaction: Transaction;
  subscriptionOverride: SubscriptionOverride | null;
  partnerBank: SelectedBankOption | null;
  ownerId?: number | undefined;
  unknownIban: string | null;
  zahlungspartnerOptions: ZahlungspartnerRecord[];
  onLinkIbanToZahlungspartner: (iban: string, zahlungspartnerId: number) => Promise<void>;
  onCreateZahlungspartnerForIban: (iban: string, name: string) => Promise<void>;
};

export function ZahlungspartnerSection({
  transaction,
  subscriptionOverride,
  partnerBank,
  ownerId,
  unknownIban,
  zahlungspartnerOptions,
  onLinkIbanToZahlungspartner,
  onCreateZahlungspartnerForIban,
}: ZahlungspartnerSectionProps) {
  const { isEntgeltabschluss, deviateApplicant, overrideLogoSrc, partnerLogoSrc } =
    useTransactionDerivations(transaction, subscriptionOverride);

  const {
    selectedZahlungspartnerId,
    setSelectedZahlungspartnerId,
    newZahlungspartnerName,
    setNewZahlungspartnerName,
    savingIbanMapping,
    linkUnknownIban,
    createOwnerForUnknownIban,
  } = useIbanLinking(
    transaction.id,
    unknownIban,
    onLinkIbanToZahlungspartner,
    onCreateZahlungspartnerForIban,
  );

  return (
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
        {subscriptionOverride ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30">
            <BrandIcon
              src={overrideLogoSrc}
              alt={subscriptionOverride.name}
              sizeClassName="size-8 shrink-0"
              backgroundClassName={
                subscriptionOverride.logoWhiteBackground ? "bg-white" : "bg-zinc-900"
              }
              kind={subscriptionOverride.isCompany ? "company" : "person"}
              imgNoPadding={!subscriptionOverride.logoPadding}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {subscriptionOverride.name}
              </p>
              <div className="flex items-center gap-1">
                <p className="text-[10px] text-muted-foreground">via Abonnement</p>
                <HelpButton className="!size-3 !text-[8px]">
                  <p>
                    Diese Transaktion ist einem Abonnement zugeordnet. Der hier
                    hinterlegte Name überschreibt den ursprünglichen Empfängernamen der
                    Bank und wird stattdessen in der Übersicht angezeigt.
                  </p>
                </HelpButton>
              </div>
            </div>
          </div>
        ) : null}

        {!transaction.zahlungspartner.iban &&
          transaction.konto.blz == ING_BLZ && (
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
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                  Unbekannte IBAN
                  <HelpButton className="!size-3 !text-[8px]">
                    <p>
                      Die IBAN dieses Zahlungspartners ist noch keinem Eintrag zugeordnet.
                      Ordne sie einem bestehenden Zahlungspartner zu oder lege einen neuen
                      an, damit die Transaktion korrekt in Analysen und Übersichten
                      erscheint.
                    </p>
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
  );
}
