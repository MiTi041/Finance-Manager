import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleRow } from "@/components/toggle-row";
import { BrandIcon } from "@/components/bank-logo";
import { Plus, Trash2 } from "lucide-react";
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
  isPerson: boolean;
  hasLogo: boolean;
  logoSrc: string;
  uploadingLogo: boolean;
  deletingLogo: boolean;
  onLogoUpload: (file: File) => void;
  onLogoDelete: () => void;
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
  isPerson,
  hasLogo,
  logoSrc,
  uploadingLogo,
  deletingLogo,
  onLogoUpload,
  onLogoDelete,
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

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Logo</label>
            {hasLogo ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3">
                <BrandIcon
                  src={logoSrc}
                  alt={form.account_name}
                  sizeClassName="size-12 shrink-0"
                  backgroundClassName="bg-zinc-900"
                  kind={isPerson ? "person" : "company"}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground mb-2">
                    Lokales Bild hinterlegt
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer group" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) onLogoUpload(file);
                          event.target.value = "";
                        }}
                      />
                      <span className="inline-flex h-10 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                        {uploadingLogo ? (
                          <>
                            <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
                            Hochladen…
                          </>
                        ) : (
                          "Bild ersetzen"
                        )}
                      </span>
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        onLogoDelete();
                      }}
                      disabled={deletingLogo}
                    >
                      {deletingLogo ? (
                        <>
                          <span className="mr-1 size-3 animate-spin rounded-full border border-current border-t-transparent" />
                          Lösche…
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-1 size-3" />
                          Bild entfernen
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <label className="cursor-pointer group" onClick={(e) => e.stopPropagation()}>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onLogoUpload(file);
                    event.target.value = "";
                  }}
                />
                <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors group-hover:border-muted-foreground/60 group-hover:bg-muted/40">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 bg-background text-muted-foreground transition-colors group-hover:text-foreground">
                    {uploadingLogo ? (
                      <span className="size-4 animate-spin rounded-full border border-current border-t-transparent" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {uploadingLogo ? "Wird hochgeladen…" : "Logo hochladen"}
                    </p>
                  </div>
                </div>
              </label>
            )}
          </div>

          <ToggleRow
            title="Spendenkonto"
            description="Wird für Spenden-Überweisungen genutzt."
            checked={form.is_donation_account}
            onCheckedChange={(is_donation_account) =>
              setForm((current) => ({ ...current, is_donation_account }))
            }
            stopPropagation
          />
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