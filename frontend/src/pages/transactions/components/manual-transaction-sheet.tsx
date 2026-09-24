import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CategoryCombobox } from "@/components/category-combobox";
import { DatePicker } from "@/components/date-picker";
import { RecipientCombobox } from "./recipient-combobox";
import { buildRecipientOptions } from "@/lib/recipient-options";
import { type BankAccountOption } from "@/lib/utils/accounts";
import { type RecipientAccountRecord } from "@/lib/recipient-accounts";
import { type ZahlungspartnerRecord } from "@/lib/zahlungspartner";
import { createManualTransaction, updateManualTransaction } from "@/lib/transactions";
import { UNASSIGNED_CATEGORY_VALUE, type TransactionCategoryOption } from "@/lib/utils/categories";
import { type Transaction } from "@/types/transaction";

type ManualTransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountIban: string;
  accountName: string;
  categoryOptions: TransactionCategoryOption[];
  ownAccounts: BankAccountOption[];
  recipientAccounts: RecipientAccountRecord[];
  zahlungspartner: ZahlungspartnerRecord[];
  transaction?: Transaction | null;
  onCreated: () => void | Promise<void>;
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ManualTransactionSheet({
  open,
  onOpenChange,
  accountIban,
  accountName,
  categoryOptions,
  ownAccounts,
  recipientAccounts,
  zahlungspartner,
  transaction = null,
  onCreated,
}: ManualTransactionSheetProps) {
  const isEdit = transaction !== null;
  const [date, setDate] = useState<Date | null>(new Date());
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientIban, setRecipientIban] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState(UNASSIGNED_CATEGORY_VALUE);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const initializedKey = useRef<string | null>(null);

  const recipientGroups = useMemo(
    () => buildRecipientOptions({ ownAccounts, recipientAccounts, zahlungspartner }),
    [ownAccounts, recipientAccounts, zahlungspartner],
  );

  const reset = () => {
    setDate(new Date());
    setAmount("");
    setRecipient("");
    setRecipientIban("");
    setPurpose("");
    setCategory(UNASSIGNED_CATEGORY_VALUE);
    setNote("");
  };

  useEffect(() => {
    if (!open) {
      initializedKey.current = null;
      return;
    }
    const key = transaction ? `edit-${transaction.id}` : "create";
    if (initializedKey.current === key) return;
    initializedKey.current = key;

    if (transaction) {
      setDate(
        transaction.daten.buchungsdatum ? new Date(transaction.daten.buchungsdatum) : new Date(),
      );
      setAmount(String(transaction.betrag.wert));
      setRecipient(transaction.zahlungspartner.name);
      setRecipientIban(transaction.zahlungspartner.iban);
      setPurpose(transaction.texte.verwendungszweck);
      setCategory(
        transaction.technisch.kategorieId == null
          ? UNASSIGNED_CATEGORY_VALUE
          : String(transaction.technisch.kategorieId),
      );
      setNote(transaction.texte.anmerkung);
    } else {
      reset();
    }
  }, [open, transaction]);

  const parsedAmount = Number(amount.replace(",", "."));
  const canSubmit = Boolean(date) && Number.isFinite(parsedAmount) && parsedAmount !== 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !date || saving) return;

    setSaving(true);
    const payload = {
      date: toIsoDate(date),
      amount: parsedAmount,
      recipient_name: recipient.trim() || null,
      recipient_iban: recipientIban.trim() || null,
      purpose: purpose.trim() || null,
      category: category === UNASSIGNED_CATEGORY_VALUE ? null : Number(category),
      note: note.trim() || null,
    };
    try {
      if (transaction) {
        await updateManualTransaction(transaction.id, payload);
        toast.success("Transaktion gespeichert");
      } else {
        await createManualTransaction({ account_iban: accountIban, ...payload });
        toast.success("Transaktion hinzugefügt");
        reset();
      }
      onOpenChange(false);
      await onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : transaction
            ? "Transaktion konnte nicht gespeichert werden"
            : "Transaktion konnte nicht angelegt werden",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Transaktion bearbeiten" : "Transaktion hinzufügen"}</SheetTitle>
          <SheetDescription>
            {accountName} · {accountIban}
          </SheetDescription>
        </SheetHeader>

        <form className="flex flex-1 flex-col gap-4 overflow-y-auto px-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label>Datum</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="manual-amount">Betrag</Label>
            <Input
              id="manual-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Ein- oder Ausgabe"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="manual-recipient">Empfänger / Auftraggeber</Label>
            <RecipientCombobox
              id="manual-recipient"
              value={recipient}
              onValueChange={setRecipient}
              groups={recipientGroups}
              onSelect={(option) => {
                setRecipient(option.name);
                setRecipientIban(option.iban);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="manual-recipient-iban">IBAN</Label>
            <Input
              id="manual-recipient-iban"
              value={recipientIban}
              onChange={(event) => setRecipientIban(event.target.value)}
              placeholder="DE..."
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="manual-purpose">Verwendungszweck</Label>
            <Input
              id="manual-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <Label>Kategorie</Label>
            <CategoryCombobox
              options={categoryOptions}
              value={category}
              onValueChange={setCategory}
              showNoneOption
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="manual-note">Notiz</Label>
            <Input
              id="manual-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              autoComplete="off"
            />
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              <span>{isEdit ? "Speichern" : "Hinzufügen"}</span>
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
