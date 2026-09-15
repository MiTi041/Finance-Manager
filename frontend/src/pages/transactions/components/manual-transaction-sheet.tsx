import { useState } from "react";
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
import { createManualTransaction } from "@/lib/transactions";
import { UNASSIGNED_CATEGORY_VALUE, type TransactionCategoryOption } from "@/lib/utils/categories";

type ManualTransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountIban: string;
  accountName: string;
  categoryOptions: TransactionCategoryOption[];
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
  onCreated,
}: ManualTransactionSheetProps) {
  const [date, setDate] = useState<Date | null>(new Date());
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientIban, setRecipientIban] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState(UNASSIGNED_CATEGORY_VALUE);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDate(new Date());
    setAmount("");
    setRecipient("");
    setRecipientIban("");
    setPurpose("");
    setCategory(UNASSIGNED_CATEGORY_VALUE);
    setNote("");
  };

  const parsedAmount = Number(amount.replace(",", "."));
  const canSubmit = Boolean(date) && Number.isFinite(parsedAmount) && parsedAmount !== 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !date || saving) return;

    setSaving(true);
    try {
      await createManualTransaction({
        account_iban: accountIban,
        date: toIsoDate(date),
        amount: parsedAmount,
        recipient_name: recipient.trim() || null,
        recipient_iban: recipientIban.trim() || null,
        purpose: purpose.trim() || null,
        category: category === UNASSIGNED_CATEGORY_VALUE ? null : Number(category),
        note: note.trim() || null,
      });
      toast.success("Transaktion hinzugefügt");
      reset();
      onOpenChange(false);
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transaktion konnte nicht angelegt werden");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Transaktion hinzufügen</SheetTitle>
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
              placeholder="-12,50 für Ausgabe, 12,50 für Einnahme"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="manual-recipient">Empfänger / Auftraggeber</Label>
            <Input
              id="manual-recipient"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              autoComplete="off"
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
              <span>Hinzufügen</span>
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
