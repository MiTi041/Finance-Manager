import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleRow } from "@/components/toggle-row";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RecipientAccountFormState = {
  account_name: string;
  iban: string;
  bic: string;
  recipient_name: string;
  is_donation_account: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: RecipientAccountFormState;
  setForm: (updater: (prev: RecipientAccountFormState) => RecipientAccountFormState) => void;
  saving: boolean;
  isDirty: boolean;
  onSave: () => void;
};

export function RecipientAccountCreateDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  isDirty,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empfängerkonto hinzufügen</DialogTitle>
          <DialogDescription>
            Kontoname, IBAN, BIC und Empfängername werden hier hinterlegt.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor="recipient-account-name"
            >
              Kontoname
            </label>
            <Input
              id="recipient-account-name"
              value={form.account_name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  account_name: event.target.value,
                }))
              }
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor="recipient-account-recipient"
            >
              Empfängername
            </label>
            <Input
              id="recipient-account-recipient"
              value={form.recipient_name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  recipient_name: event.target.value,
                }))
              }
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="recipient-account-iban">
              IBAN
            </label>
            <Input
              id="recipient-account-iban"
              value={form.iban}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  iban: event.target.value,
                }))
              }
              placeholder="DE..."
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="recipient-account-bic">
              BIC
            </label>
            <Input
              id="recipient-account-bic"
              value={form.bic}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  bic: event.target.value,
                }))
              }
              placeholder="BIC optional"
              autoComplete="off"
            />
          </div>

          <ToggleRow
            title="Spendenkonto"
            description="Wird für Spenden-Überweisungen genutzt."
            fullWidth={false}
            checked={form.is_donation_account}
            onCheckedChange={(is_donation_account) =>
              setForm((current) => ({ ...current, is_donation_account }))
            }
          />

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={
                saving ||
                !isDirty ||
                !form.account_name.trim() ||
                !form.iban.trim() ||
                !form.recipient_name.trim()
              }
            >
              {saving ? "Speichere ..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
