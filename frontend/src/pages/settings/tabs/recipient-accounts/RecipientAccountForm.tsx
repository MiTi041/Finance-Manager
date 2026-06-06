import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { type RecipientAccountRecord } from "@/lib/recipient-accounts";

type RecipientAccountFormState = {
  account_name: string;
  iban: string;
  bic: string;
  recipient_name: string;
  is_donation_account: boolean;
};

type Props = {
  account: RecipientAccountRecord;
  form: RecipientAccountFormState;
  setForm: (updater: (prev: RecipientAccountFormState) => RecipientAccountFormState) => void;
  saving: boolean;
  isDirty: boolean;
  onSave: () => void;
  onDelete: () => void;
  deleting: boolean;
};

export function RecipientAccountForm({
  account,
  form,
  setForm,
  saving,
  isDirty,
  onSave,
  onDelete,
  deleting,
}: Props) {
  return (
    <div className="border-y border-muted/60 bg-muted/20">
      <div className="flex flex-col gap-0 divide-y divide-border/60">
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-medium"
                htmlFor={`recipient-account-name-${account.id}`}
              >
                Kontoname
              </label>
              <Input
                id={`recipient-account-name-${account.id}`}
                value={form.account_name}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    account_name: event.target.value,
                  }))
                }
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-medium"
                htmlFor={`recipient-account-recipient-${account.id}`}
              >
                Empfängername
              </label>
              <Input
                id={`recipient-account-recipient-${account.id}`}
                value={form.recipient_name}
                onClick={(event) => event.stopPropagation()}
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
              <label
                className="text-sm font-medium"
                htmlFor={`recipient-account-iban-${account.id}`}
              >
                IBAN
              </label>
              <Input
                id={`recipient-account-iban-${account.id}`}
                value={form.iban}
                onClick={(event) => event.stopPropagation()}
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
              <label
                className="text-sm font-medium"
                htmlFor={`recipient-account-bic-${account.id}`}
              >
                BIC
              </label>
              <Input
                id={`recipient-account-bic-${account.id}`}
                value={form.bic}
                onClick={(event) => event.stopPropagation()}
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
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.is_donation_account}
            className={
              form.is_donation_account
                ? "cursor-pointer flex w-full items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left transition-colors hover:bg-emerald-500/15"
                : "cursor-pointer flex w-full items-center justify-between rounded-lg border border-muted bg-muted/70 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            }
            onClick={(event) => {
              event.stopPropagation();
              setForm((current) => ({
                ...current,
                is_donation_account: !current.is_donation_account,
              }));
            }}
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
                  : "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-muted-foreground"
              }
            >
              {form.is_donation_account ? "Ja" : "Nein"}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 justify-end px-4 py-2">
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
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete()}
            disabled={deleting || saving}
          >
            <Trash2 className="size-4" />
            {deleting ? "Lösche ..." : "Löschen"}
          </Button>
        </div>
      </div>
    </div>
  );
}
