import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

          <button
            type="button"
            role="switch"
            aria-checked={form.is_donation_account}
            className={
              form.is_donation_account
                ? "flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left transition-colors hover:bg-emerald-500/15"
                : "flex items-center justify-between rounded-lg border border-muted/60 bg-background px-4 py-3 text-left transition-colors hover:bg-muted/40"
            }
            onClick={() =>
              setForm((current) => ({
                ...current,
                is_donation_account: !current.is_donation_account,
              }))
            }
          >
            <div>
              <div className="text-sm font-medium">Spendenkonto</div>
              <div className="text-xs text-muted-foreground">
                Wird für Spenden-Überweisungen genutzt.
              </div>
            </div>
            <span
              className={
                form.is_donation_account
                  ? "inline-flex items-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white"
                  : "inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              }
            >
              {form.is_donation_account ? "Ja" : "Nein"}
            </span>
          </button>

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
