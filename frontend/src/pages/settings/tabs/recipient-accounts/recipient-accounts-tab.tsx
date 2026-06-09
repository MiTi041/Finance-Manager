import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Landmark, Plus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  fetchZahlungspartnerReferenceData,
  type ZahlungspartnerMapping,
} from "@/lib/zahlungspartner";
import {
  createRecipientAccount,
  deleteRecipientAccount,
  fetchRecipientAccountsReferenceData,
  type RecipientAccountRecord,
  updateRecipientAccount,
} from "@/lib/recipient-accounts";
import { VirtualizedList } from "@/components/virtualized-list";
import { BrandIcon } from "@/components/bank-logo";
import { DiscardChangesDialog, useSettingsTab } from "@/pages/settings/hooks/use-settings-tab";
import { RecipientAccountForm } from "./recipient-account-form";
import { RecipientAccountCreateDialog } from "./recipient-account-create-dialog";

const EMPTY_FORM = {
  account_name: "",
  iban: "",
  bic: "",
  recipient_name: "",
  is_donation_account: false,
};

type RecipientAccountFormState = typeof EMPTY_FORM;

function formatIban(value?: string | null) {
  if (!value) return "—";
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/(.{4})(?=.)/g, "$1 ");
}

function normalizeAccountValue(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeRecipientAccountDraft(form: RecipientAccountFormState) {
  return {
    account_name: form.account_name.trim(),
    iban: normalizeAccountValue(form.iban),
    bic: normalizeAccountValue(form.bic) || null,
    recipient_name: form.recipient_name.trim(),
    is_donation_account: form.is_donation_account,
  };
}

function isRecipientAccountDirty(
  editingRecipientAccount: RecipientAccountRecord | null,
  form: RecipientAccountFormState,
) {
  const draft = normalizeRecipientAccountDraft(form);

  if (!editingRecipientAccount) {
    return (
      draft.account_name !== "" ||
      draft.iban !== "" ||
      draft.bic !== null ||
      draft.recipient_name !== "" ||
      draft.is_donation_account !== false
    );
  }

  return (
    draft.account_name !== editingRecipientAccount.account_name ||
    draft.iban !== normalizeAccountValue(editingRecipientAccount.iban) ||
    draft.bic !==
      (normalizeAccountValue(editingRecipientAccount.bic ?? "") || null) ||
    draft.recipient_name !== editingRecipientAccount.recipient_name ||
    draft.is_donation_account !== editingRecipientAccount.is_donation_account
  );
}

export function RecipientAccountsTab() {
  const [ibanMappings, setIbanMappings] = useState<ZahlungspartnerMapping[]>([]);

  const hook = useSettingsTab<RecipientAccountRecord, RecipientAccountFormState>(
    {
      entityName: "Empfängerkonto",
      cacheKey: "recipient-accounts-reference-data",
      loadErrorTitle: "Empfängerkonten konnten nicht geladen werden",
      saveErrorTitle: "Empfängerkonto konnte nicht gespeichert werden",
      deleteErrorTitle: "Empfängerkonto konnte nicht gelöscht werden",
      EMPTY_FORM,
      fetchItems: async (options) => {
        const [recipientPayload, zahlungspartnerPayload] = await Promise.all([
          fetchRecipientAccountsReferenceData(options),
          fetchZahlungspartnerReferenceData(options),
        ]);
        setIbanMappings(zahlungspartnerPayload.iban_mappings ?? []);
        return recipientPayload.recipient_accounts ?? [];
      },
      createItem: (payload) =>
        createRecipientAccount(
          payload as Parameters<typeof createRecipientAccount>[0],
        ),
      updateItem: (id, payload) =>
        updateRecipientAccount(
          id,
          payload as Parameters<typeof updateRecipientAccount>[1],
        ),
      deleteItem: (id) => deleteRecipientAccount(id),
      normalizeDraft: normalizeRecipientAccountDraft,
      isDirty: isRecipientAccountDirty,
      formFromItem: (account) => ({
        account_name: account.account_name,
        iban: account.iban,
        bic: account.bic ?? "",
        recipient_name: account.recipient_name,
        is_donation_account: account.is_donation_account,
      }),
    },
  );

  const visibleRecipientAccounts = useMemo(
    () => hook.items,
    [hook.items],
  );

  const filterRecipientAccount = (
    recipientAccount: RecipientAccountRecord,
    query: string,
  ) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const haystack = [
      recipientAccount.account_name,
      recipientAccount.iban,
      recipientAccount.bic ?? "",
      recipientAccount.recipient_name,
      recipientAccount.is_donation_account ? "spendenkonto" : "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  };

  return (
    <div>
      {hook.error ? (
        <EmptyState
          title="Empfängerkonten konnten nicht geladen werden"
          text={hook.error}
          illustration={<Landmark className="size-5" />}
        />
      ) : (
        <VirtualizedList
          items={visibleRecipientAccounts}
          loading={hook.loading}
          filterItem={filterRecipientAccount}
          searchPlaceholder="Empfängerkonten suchen..."
          externalScrollRef={hook.listScrollRef}
          scrollClassName="max-h-[65vh]"
          emptyStateTitle="Keine Empfängerkonten vorhanden"
          emptyStateText="Lege Empfängerkonten mit Kontoname, IBAN, BIC und Empfängername an."
          emptyStateIllustration={<Landmark className="size-5" />}
          getItemKey={(recipientAccount) => recipientAccount.id}
          getItemHeight={(recipientAccount) =>
            hook.editingItem?.id === recipientAccount.id ? 368 : 96
          }
          toolbarActions={[
            <Button
              key="recipient-account-create"
              type="button"
              onClick={hook.openCreateDialog}
            >
              <Plus className="size-4" />
              Empfängerkonto hinzufügen
            </Button>,
          ]}
          renderLoadingSkeleton={() => (
            <div className="flex items-center gap-4 border-b border-muted/60 bg-background px-4 py-3">
              <div className="size-12 shrink-0 rounded-lg border bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-[42%] max-w-[220px] rounded bg-muted" />
                  <div className="h-5 w-[88px] rounded-full bg-muted" />
                </div>
                <div className="h-3 w-[58%] max-w-[340px] rounded bg-muted" />
                <div className="h-3 w-[74%] max-w-[420px] rounded bg-muted" />
              </div>
              <div className="h-9 w-[100px] shrink-0 rounded-md bg-muted" />
            </div>
          )}
          renderItem={(recipientAccount) => {
            const isExpanded =
              hook.editingItem?.id === recipientAccount.id;

            const mapping = ibanMappings.find(
              (m) =>
                m.iban === normalizeAccountValue(recipientAccount.iban),
            );

            return (
              <div className="border-b border-muted/60 bg-background">
                <button
                  type="button"
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
                  onClick={() => hook.openEditRow(recipientAccount)}
                >
                  <BrandIcon
                    src={
                      mapping?.zahlungspartner_logo_url ||
                      mapping?.zahlungspartner_local_logo_path ||
                      undefined
                    }
                    alt={
                      mapping?.zahlungspartner_name ||
                      recipientAccount.recipient_name
                    }
                    sizeClassName="size-12 shrink-0"
                    backgroundClassName={
                      mapping?.zahlungspartner_logo_white_background
                        ? "bg-white"
                        : "bg-zinc-900"
                    }
                    kind={
                      mapping?.zahlungspartner_is_company ? "company" : "person"
                    }
                    imgNoPadding={!mapping?.zahlungspartner_logo_padding}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {recipientAccount.account_name}
                      </span>
                      {recipientAccount.is_donation_account && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 text-[11px]"
                        >
                          Spendenkonto
                        </Badge>
                      )}
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatIban(recipientAccount.iban)}</span>
                      <span aria-hidden="true">•</span>
                      <span>{recipientAccount.recipient_name}</span>
                      {recipientAccount.bic && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span>BIC {recipientAccount.bic}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <ChevronDown
                    className={
                      isExpanded
                        ? "size-4 shrink-0 text-muted-foreground transition-transform rotate-180"
                        : "size-4 shrink-0 text-muted-foreground transition-transform"
                    }
                  />
                </button>

                {isExpanded && (
                  <RecipientAccountForm
                    account={recipientAccount}
                    form={hook.form}
                    setForm={hook.setForm}
                    saving={hook.saving}
                    isDirty={isRecipientAccountDirty(hook.editingItem, hook.form)}
                    onSave={() => void hook.handleSave()}
                    onDelete={() => hook.openDeleteDialog(recipientAccount)}
                    deleting={hook.deletingItemId === recipientAccount.id}
                  />
                )}
              </div>
            );
          }}
        />
      )}

      <RecipientAccountCreateDialog
        open={hook.createDialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          hook.closeCreateEditor();
        }}
        form={hook.form}
        setForm={hook.setForm}
        saving={hook.saving}
        isDirty={isRecipientAccountDirty(null, hook.form)}
        onSave={() => void hook.handleSave()}
      />

      <DiscardChangesDialog hook={hook} />
      <ConfirmDialog
        open={Boolean(hook.itemToDelete)}
        title="Empfängerkonto löschen"
        description={`Empfängerkonto "${hook.itemToDelete?.account_name ?? ""}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        loading={
          hook.itemToDelete
            ? hook.deletingItemId === hook.itemToDelete.id
            : false
        }
        onOpenChange={(open) => {
          if (!open) hook.setItemToDelete(null);
        }}
        onConfirm={hook.confirmDelete}
      />
    </div>
  );
}
