import { useEffect, useMemo, useState } from "react";
import { ArrowRightToLine, Info, TriangleAlert, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/searchable-select";
import { ToggleRow } from "@/components/toggle-row";
import { PayoutSlider } from "@/pages/allocation/components/payout-slider";
import { formatAmount } from "@/lib/utils/format";
import { isValidIban } from "@/lib/transfer-utils";
import { type RecipientAccountRecord } from "@/lib/recipient-accounts";

export type SenderAccount = {
  iban: string;
  name: string;
  bankName: string;
  balance: number;
};

export type OwnAccount = {
  iban: string;
  name: string;
  bankName: string;
};

export type TransferSetupResult = {
  senderIban: string;
  recipientName: string;
  recipientIban: string;
  recipientBic?: string;
  purpose: string;
  amount: number;
  saveRecipient: boolean;
  accountName?: string;
  instant: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  senderAccount?: SenderAccount;
  recipientAccounts: RecipientAccountRecord[];
  ownAccounts: OwnAccount[];
  onConfirm: (result: TransferSetupResult) => void;
};

function formatIban(iban: string) {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

const MANUAL = "manual";

export function TransferSetupDialog({
  open,
  onOpenChange,
  senderAccount,
  recipientAccounts,
  ownAccounts,
  onConfirm,
}: Props) {
  const [recipientValue, setRecipientValue] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualIban, setManualIban] = useState("");
  const [manualBic, setManualBic] = useState("");
  const [saveRecipient, setSaveRecipient] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState(0);
  const [instant, setInstant] = useState(true);

  useEffect(() => {
    if (!open) return;
    setRecipientValue(MANUAL);
    setManualName("");
    setManualIban("");
    setManualBic("");
    setSaveRecipient(false);
    setAccountName("");
    setPurpose("");
    setAmount(0);
    setInstant(true);
  }, [open]);

  const sender = senderAccount;
  const maxAmount = Math.max(0, sender?.balance ?? 0);

  const recipientOptions = useMemo(
    () => [
      ...recipientAccounts.map((r) => ({
        value: `empf:${r.id}`,
        label: `${r.account_name} ${r.recipient_name} ${r.iban}`,
      })),
      ...ownAccounts
        .filter((a) => a.iban !== sender?.iban)
        .map((a) => ({
          value: `bank:${a.iban}`,
          label: `${a.name} ${a.iban}`,
        })),
    ],
    [recipientAccounts, ownAccounts, sender],
  );

  const selectedRecipient = useMemo(() => {
    if (recipientValue === MANUAL) return null;
    if (recipientValue.startsWith("empf:")) {
      const r = recipientAccounts.find((a) => a.id === Number(recipientValue.slice(5)));
      return r ? { name: r.recipient_name, iban: r.iban, bic: r.bic ?? "" } : null;
    }
    if (recipientValue.startsWith("bank:")) {
      const a = ownAccounts.find((x) => x.iban === recipientValue.slice(5));
      return a ? { name: a.name, iban: a.iban, bic: "" } : null;
    }
    return null;
  }, [recipientValue, recipientAccounts, ownAccounts]);

  const recipientName = selectedRecipient?.name ?? manualName.trim();
  const recipientIban = selectedRecipient?.iban ?? manualIban.trim();
  const recipientBic = selectedRecipient?.bic || manualBic.trim() || undefined;

  const manualIbanValid =
    recipientIban === "" ||
    (isValidIban(recipientIban) && recipientIban.toUpperCase() !== sender?.iban);
  const recipientValid = recipientName !== "" && manualIbanValid && recipientIban !== "";
  const amountValid = amount > 0 && amount <= maxAmount;
  const canSubmit = !!sender && recipientValid && amountValid;

  const handleSubmit = () => {
    if (!canSubmit || !sender) return;
    onConfirm({
      senderIban: sender.iban,
      recipientName,
      recipientIban: recipientIban.toUpperCase(),
      recipientBic,
      purpose: purpose.trim(),
      amount,
      saveRecipient: recipientValue === MANUAL && saveRecipient,
      accountName: accountName.trim() || undefined,
      instant,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Überweisung</DialogTitle>
          <DialogDescription>Wähle Empfänger, Verwendungszweck und Betrag.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {sender ? (
            maxAmount > 0 ? (
              <div className="pt-4">
                <PayoutSlider value={amount} max={maxAmount} bigValue onChange={setAmount} />
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Kontostand ist 0 oder unbekannt – von diesem Konto kann nicht überwiesen werden.
                </span>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Kein Transfer-aktives Konto verfügbar.</p>
          )}

          {sender && (
            <div className="space-y-1.5">
              <Label>Absenderkonto</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <div className="flex min-w-0 flex-col items-start gap-0">
                  <span className="truncate text-sm leading-tight">{sender.name}</span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground leading-tight">
                    {formatIban(sender.iban)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Empfänger</Label>
            <SearchableSelect
              height={15}
              value={recipientValue === MANUAL ? "" : recipientValue}
              onValueChange={(v) => setRecipientValue(v)}
              options={recipientOptions}
              placeholder="Empfänger auswählen"
              searchPlaceholder="Empfänger suchen…"
              emptyText="Kein Empfänger gefunden"
              renderSelected={(option) => {
                const isBank = option.value.startsWith("bank:");
                const a = isBank
                  ? ownAccounts.find((x) => x.iban === option.value.slice(5))
                  : recipientAccounts.find((x) => x.id === Number(option.value.slice(5)));
                if (!a) return <span className="truncate">{option.label}</span>;
                return (
                  <div className="flex w-full flex-col items-start gap-0">
                    <span className="truncate text-sm leading-tight">
                      {isBank ? a.name : (a as RecipientAccountRecord).account_name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground leading-tight">
                      {formatIban(a.iban)}
                    </span>
                  </div>
                );
              }}
              renderOption={(option) => {
                const isBank = option.value.startsWith("bank:");
                const a = isBank
                  ? ownAccounts.find((x) => x.iban === option.value.slice(5))
                  : recipientAccounts.find((x) => x.id === Number(option.value.slice(5)));
                if (!a) return <span>{option.label}</span>;
                return (
                  <div className="flex flex-col gap-0.5 py-1">
                    <span className="font-medium text-sm leading-tight">
                      {isBank ? a.name : (a as RecipientAccountRecord).account_name}
                    </span>
                    <span className="text-xs text-muted-foreground leading-tight">
                      {isBank ? "Eigenes Konto" : (a as RecipientAccountRecord).recipient_name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground/70 leading-tight">
                      {formatIban(a.iban)}
                    </span>
                  </div>
                );
              }}
            />
          </div>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">oder</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-name">
                Empfänger <span className="text-destructive">*</span>
              </Label>
              <Input
                id="manual-name"
                value={manualName}
                onChange={(e) => {
                  setManualName(e.target.value);
                  if (recipientValue !== MANUAL) setRecipientValue(MANUAL);
                }}
                placeholder="Name des Kontoinhabers"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manual-iban">
                  IBAN <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="manual-iban"
                  value={manualIban}
                  onChange={(e) => {
                    setManualIban(e.target.value);
                    if (recipientValue !== MANUAL) setRecipientValue(MANUAL);
                  }}
                  placeholder="DE…"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-bic">BIC</Label>
                <Input
                  id="manual-bic"
                  value={manualBic}
                  onChange={(e) => setManualBic(e.target.value)}
                  placeholder="optional"
                  className="font-mono"
                />
              </div>
            </div>
              {!manualIbanValid && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <TriangleAlert className="size-3 shrink-0" /> IBAN ist ungültig.
                </p>
              )}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="save-recipient"
                    checked={saveRecipient}
                    onCheckedChange={(c) => setSaveRecipient(c === true)}
                  />
                  <Label htmlFor="save-recipient" className="font-normal cursor-pointer">
                    Als Empfängerkonto speichern
                  </Label>
                </div>
                {saveRecipient && (
                  <div className="space-y-1.5">
                    <Label htmlFor="account-name">Name für das Empfängerkonto</Label>
                    <Input
                      id="account-name"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder={manualName || "z. B. Stromrechnung"}
                    />
                  </div>
                )}
              </div>
            </div>

          <div className="space-y-1.5">
            <Label htmlFor="purpose">Verwendungszweck</Label>
            <Input
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="optional"
            />
          </div>

          <ToggleRow
            title="Echtzeit (SEPA Instant)"
            description="Geld kommt sofort an, falls deine Bank SEPA-Instant unterstützt."
            icon={<Zap className="size-4" />}
            size="sm"
            checked={instant}
            onCheckedChange={setInstant}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              <ArrowRightToLine className="size-4" />
              Jetzt bezahlen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
