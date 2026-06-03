import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Landmark, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createRecipientAccount,
  deleteRecipientAccount,
  fetchKontoinhaberReferenceData,
  fetchRecipientAccountsReferenceData,
  type KontoinhaberMapping,
  type RecipientAccountRecord,
  updateRecipientAccount,
} from "@/lib/db";
import { hasFreshCache } from "@/lib/fetch-cache";
import { VirtualizedList } from "@/components/virtualized-list";
import { BrandIcon } from "@/components/bank-logo";

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

type PendingRecipientAccountAction =
  | { kind: "close-edit" }
  | { kind: "switch-edit"; recipientAccount: RecipientAccountRecord }
  | { kind: "close-create" };

export function RecipientAccountsTab() {
  const [recipientAccounts, setRecipientAccounts] = useState<
    RecipientAccountRecord[]
  >([]);
  const [ibanMappings, setIbanMappings] = useState<KontoinhaberMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRecipientAccount, setSavingRecipientAccount] = useState(false);
  const [deletingRecipientAccountId, setDeletingRecipientAccountId] = useState<
    number | null
  >(null);
  const [recipientAccountToDelete, setRecipientAccountToDelete] =
    useState<RecipientAccountRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingRecipientAccount, setEditingRecipientAccount] =
    useState<RecipientAccountRecord | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false);
  const [pendingRecipientAccountAction, setPendingRecipientAccountAction] =
    useState<PendingRecipientAccountAction | null>(null);
  const [form, setForm] = useState<RecipientAccountFormState>(EMPTY_FORM);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const visibleRecipientAccounts = useMemo(
    () => recipientAccounts,
    [recipientAccounts],
  );

  const loadData = async (options?: {
    silent?: boolean;
    forceRefresh?: boolean;
  }) => {
    const shouldShowLoading =
      options?.forceRefresh ||
      !hasFreshCache("recipient-accounts-reference-data");

    if (!options?.silent && shouldShowLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const [recipientPayload, kontoinhaberPayload] = await Promise.all([
        fetchRecipientAccountsReferenceData({
          forceRefresh: options?.forceRefresh,
        }),
        fetchKontoinhaberReferenceData({
          forceRefresh: options?.forceRefresh,
        }),
      ]);
      setRecipientAccounts(recipientPayload.recipient_accounts ?? []);
      setIbanMappings(kontoinhaberPayload.iban_mappings ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Empfängerkonten konnten nicht geladen werden",
      );
      setRecipientAccounts([]);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadData();

    const onReferenceChange = () => {
      void loadData({ forceRefresh: true });
    };

    window.addEventListener(
      "finance-reference-data-changed",
      onReferenceChange,
    );

    return () => {
      window.removeEventListener(
        "finance-reference-data-changed",
        onReferenceChange,
      );
    };
  }, []);

  const resetEditor = () => {
    setEditingRecipientAccount(null);
    setForm(EMPTY_FORM);
  };

  const closeEditEditor = () => {
    if (isRecipientAccountDirty(editingRecipientAccount, form)) {
      setPendingRecipientAccountAction({ kind: "close-edit" });
      setDiscardChangesOpen(true);
      return;
    }

    resetEditor();
  };

  const requestOpenRecipientAccount = (
    recipientAccount: RecipientAccountRecord,
  ) => {
    if (editingRecipientAccount?.id === recipientAccount.id) {
      closeEditEditor();
      return;
    }

    if (isRecipientAccountDirty(editingRecipientAccount, form)) {
      setPendingRecipientAccountAction({
        kind: "switch-edit",
        recipientAccount,
      });
      setDiscardChangesOpen(true);
      return;
    }

    setEditingRecipientAccount(recipientAccount);
    setForm({
      account_name: recipientAccount.account_name,
      iban: recipientAccount.iban,
      bic: recipientAccount.bic ?? "",
      recipient_name: recipientAccount.recipient_name,
      is_donation_account: recipientAccount.is_donation_account,
    });
    setError(null);
  };

  const closeCreateEditor = () => {
    if (isRecipientAccountDirty(null, form)) {
      setPendingRecipientAccountAction({ kind: "close-create" });
      setDiscardChangesOpen(true);
      return;
    }

    setCreateDialogOpen(false);
    setForm(EMPTY_FORM);
  };

  const confirmDiscardChanges = () => {
    const action = pendingRecipientAccountAction;
    setPendingRecipientAccountAction(null);
    setDiscardChangesOpen(false);

    if (!action) return;

    if (action.kind === "close-edit") {
      resetEditor();
      return;
    }

    if (action.kind === "switch-edit") {
      setEditingRecipientAccount(action.recipientAccount);
      setForm({
        account_name: action.recipientAccount.account_name,
        iban: action.recipientAccount.iban,
        bic: action.recipientAccount.bic ?? "",
        recipient_name: action.recipientAccount.recipient_name,
        is_donation_account: action.recipientAccount.is_donation_account,
      });
      setError(null);
      return;
    }

    setCreateDialogOpen(false);
    setForm(EMPTY_FORM);
  };

  const openCreateDialog = () => {
    setForm(EMPTY_FORM);
    setEditingRecipientAccount(null);
    setCreateDialogOpen(true);
    resetEditor();
  };

  const openEditRow = (recipientAccount: RecipientAccountRecord) => {
    requestOpenRecipientAccount(recipientAccount);
  };

  const handleSaveRecipientAccount = async () => {
    setSavingRecipientAccount(true);
    setError(null);

    try {
      const prevScroll = listScrollRef.current?.scrollTop;
      const payload = {
        account_name: form.account_name.trim(),
        iban: normalizeAccountValue(form.iban),
        bic: normalizeAccountValue(form.bic) || null,
        recipient_name: form.recipient_name.trim(),
        is_donation_account: form.is_donation_account,
      };

      if (editingRecipientAccount) {
        const updatedRecipientAccount = await updateRecipientAccount(
          editingRecipientAccount.id,
          payload,
        );
        setRecipientAccounts((current) =>
          current.map((item) =>
            item.id === updatedRecipientAccount.id
              ? updatedRecipientAccount
              : item,
          ),
        );
        setEditingRecipientAccount(updatedRecipientAccount);
      } else {
        const createdRecipientAccount = await createRecipientAccount(payload);
        setRecipientAccounts((current) => [
          ...current,
          createdRecipientAccount,
        ]);
        setCreateDialogOpen(false);
        setForm(EMPTY_FORM);
      }

      if (prevScroll != null) {
        const restoreScroll = () => {
          try {
            if (listScrollRef.current) {
              listScrollRef.current.scrollTop = prevScroll;
            }
          } catch {
            // ignore
          }
        };

        requestAnimationFrame(() => {
          restoreScroll();
          requestAnimationFrame(() => {
            restoreScroll();
            setTimeout(restoreScroll, 120);
          });
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Empfängerkonto konnte nicht gespeichert werden",
      );
    } finally {
      setSavingRecipientAccount(false);
    }
  };

  const openDeleteRecipientAccountDialog = (
    recipientAccount: RecipientAccountRecord,
  ) => {
    setRecipientAccountToDelete(recipientAccount);
  };

  const confirmDeleteRecipientAccount = async () => {
    if (!recipientAccountToDelete) return;

    setDeletingRecipientAccountId(recipientAccountToDelete.id);
    setError(null);

    try {
      await deleteRecipientAccount(recipientAccountToDelete.id);
      setRecipientAccounts((current) =>
        current.filter((item) => item.id !== recipientAccountToDelete.id),
      );

      if (editingRecipientAccount?.id === recipientAccountToDelete.id) {
        resetEditor();
      }
      setRecipientAccountToDelete(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Empfängerkonto konnte nicht gelöscht werden",
      );
    } finally {
      setDeletingRecipientAccountId(null);
    }
  };

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
      {error ? (
        <EmptyState
          title="Empfängerkonten konnten nicht geladen werden"
          text={error}
          illustration={<Landmark className="size-5" />}
        />
      ) : (
        <VirtualizedList
          items={visibleRecipientAccounts}
          loading={loading}
          filterItem={filterRecipientAccount}
          searchPlaceholder="Empfängerkonten suchen..."
          externalScrollRef={listScrollRef}
          scrollClassName="max-h-[65vh]"
          emptyStateTitle="Keine Empfängerkonten vorhanden"
          emptyStateText="Lege Empfängerkonten mit Kontoname, IBAN, BIC und Empfängername an."
          emptyStateIllustration={<Landmark className="size-5" />}
          getItemKey={(recipientAccount) => recipientAccount.id}
          getItemHeight={(recipientAccount) =>
            editingRecipientAccount?.id === recipientAccount.id ? 368 : 96
          }
          toolbarActions={[
            <Button
              key="recipient-account-create"
              type="button"
              onClick={openCreateDialog}
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
              editingRecipientAccount?.id === recipientAccount.id;

            const mapping = ibanMappings.find(
              (m) => m.iban === normalizeAccountValue(recipientAccount.iban),
            );

            return (
              <div className="border-b border-muted/60 bg-background">
                <button
                  type="button"
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
                  onClick={() => openEditRow(recipientAccount)}
                >
                  <BrandIcon
                    src={
                      mapping?.kontoinhaber_logo_url ||
                      mapping?.kontoinhaber_local_logo_path ||
                      undefined
                    }
                    alt={
                      mapping?.kontoinhaber_name ||
                      recipientAccount.recipient_name
                    }
                    sizeClassName="size-12 shrink-0"
                    backgroundClassName={
                      mapping?.kontoinhaber_logo_white_background
                        ? "bg-white"
                        : "bg-zinc-900"
                    }
                    kind={
                      mapping?.kontoinhaber_is_company ? "company" : "person"
                    }
                    imgNoPadding={!mapping?.kontoinhaber_logo_padding}
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
                  <div className="border-y border-muted/60 bg-muted/20">
                    <div className="flex flex-col gap-0 divide-y divide-border/60">
                      <div className="flex flex-col gap-4 px-4 py-4">
                        <div className="flex flex-wrap gap-4">
                          <div className="flex flex-col gap-2">
                            <label
                              className="text-sm font-medium"
                              htmlFor={`recipient-account-name-${recipientAccount.id}`}
                            >
                              Kontoname
                            </label>
                            <Input
                              id={`recipient-account-name-${recipientAccount.id}`}
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
                              htmlFor={`recipient-account-recipient-${recipientAccount.id}`}
                            >
                              Empfängername
                            </label>
                            <Input
                              id={`recipient-account-recipient-${recipientAccount.id}`}
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
                              htmlFor={`recipient-account-iban-${recipientAccount.id}`}
                            >
                              IBAN
                            </label>
                            <Input
                              id={`recipient-account-iban-${recipientAccount.id}`}
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
                              htmlFor={`recipient-account-bic-${recipientAccount.id}`}
                            >
                              BIC
                            </label>
                            <Input
                              id={`recipient-account-bic-${recipientAccount.id}`}
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
                            <div className="text-sm font-medium">
                              Spendenkonto
                            </div>
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
                          onClick={() => void handleSaveRecipientAccount()}
                          disabled={
                            savingRecipientAccount ||
                            !isRecipientAccountDirty(
                              editingRecipientAccount,
                              form,
                            ) ||
                            !form.account_name.trim() ||
                            !form.iban.trim() ||
                            !form.recipient_name.trim()
                          }
                        >
                          {savingRecipientAccount
                            ? "Speichere ..."
                            : "Speichern"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            openDeleteRecipientAccountDialog(recipientAccount)
                          }
                          disabled={
                            deletingRecipientAccountId ===
                              recipientAccount.id || savingRecipientAccount
                          }
                        >
                          <Trash2 className="size-4" />
                          {deletingRecipientAccountId === recipientAccount.id
                            ? "Lösche ..."
                            : "Löschen"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }}
        />
      )}

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          closeCreateEditor();
        }}
      >
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
              <label
                className="text-sm font-medium"
                htmlFor="recipient-account-iban"
              >
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
              <label
                className="text-sm font-medium"
                htmlFor="recipient-account-bic"
              >
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
                onClick={() => void handleSaveRecipientAccount()}
                disabled={
                  savingRecipientAccount ||
                  !isRecipientAccountDirty(null, form) ||
                  !form.account_name.trim() ||
                  !form.iban.trim() ||
                  !form.recipient_name.trim()
                }
              >
                {savingRecipientAccount ? "Speichere ..." : "Speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={discardChangesOpen}
        title="Änderungen verwerfen?"
        description="Du hast ungespeicherte Änderungen. Wenn du jetzt schließt, gehen sie verloren."
        confirmLabel="Verwerfen"
        cancelLabel="Weiter bearbeiten"
        destructive={false}
        onOpenChange={(open) => {
          if (open) return;
          setDiscardChangesOpen(false);
          setPendingRecipientAccountAction(null);
        }}
        onConfirm={confirmDiscardChanges}
      />
      <ConfirmDialog
        open={Boolean(recipientAccountToDelete)}
        title="Empfängerkonto löschen"
        description={`Empfängerkonto "${recipientAccountToDelete?.account_name ?? ""}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        loading={
          recipientAccountToDelete
            ? deletingRecipientAccountId === recipientAccountToDelete.id
            : false
        }
        onOpenChange={(open) => {
          if (!open) setRecipientAccountToDelete(null);
        }}
        onConfirm={confirmDeleteRecipientAccount}
      />
    </div>
  );
}
