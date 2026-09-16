import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  deleteBankAccount,
  adjustBankAccountBalance,
  type StoredBankCredentials,
  updateBankAccount,
  updateBankCredentials,
} from "@/lib/bank/credentials";
import { EmptyState } from "@/components/empty-state";
import { Check, Info, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { BankLogo } from "@/components/bank-logo";
import { ToggleRow } from "@/components/toggle-row";

type BanksProps = {
  linkedBanks: StoredBankCredentials[];
  deletingScope: string | null;
  onDeleteOne: (scope: string) => void | Promise<void>;
  onAutoSyncChange: (scope: string, checked: boolean) => void;
  canTransferByBankKey?: Map<string, boolean>;
};

type EditingState = {
  scope: string;
  iban: string;
  accountName: string;
  holderName: string;
} | null;

type AccountDeleteState = {
  scope: string;
  bankName: string;
  iban: string;
  accountName: string;
  key: string;
} | null;

function formatIban(value?: string) {
  if (!value) return "—";
  // Insert a space every 4 chars for readability: DE89 3704 0044 0532 0130 00
  return value.trim().replace(/(.{4})(?=.)/g, "$1 ");
}

function transferDescription(detected: boolean | null, override: boolean | null) {
  const detectedLabel =
    detected == null ? "keine Angabe" : detected ? "möglich" : "nicht möglich";
  if (override != null) return `Manuell festgelegt (Bank: ${detectedLabel})`;
  if (detected == null) return "Keine Angabe der Bank – wird als möglich angenommen";
  return `Automatisch erkannt: ${detectedLabel}`;
}

function getAccounts(credential: StoredBankCredentials, bankCanTransfer: boolean | undefined) {
  const accounts = credential.accounts ?? [];
  if (accounts.length > 0) {
    return accounts.map((account, index) => ({
      iban: account.iban ?? credential.account_iban ?? "",
      account_name: account.account_name ?? credential.account_name ?? "",
      holder_name: account.holder_name ?? "",
      can_transfer: account.can_transfer ?? bankCanTransfer ?? null,
      can_transfer_detected: account.can_transfer_detected ?? null,
      can_transfer_override: account.can_transfer_override ?? null,
      fallback: index === 0 && !account.iban && credential.account_iban,
    }));
  }
  return [
    {
      iban: credential.account_iban ?? "",
      account_name: credential.account_name ?? "",
      holder_name: "",
      can_transfer: bankCanTransfer ?? null,
      can_transfer_detected: null,
      can_transfer_override: null,
      fallback: true,
    },
  ];
}

export function Banks({
  linkedBanks,
  deletingScope,
  onDeleteOne,
  onAutoSyncChange,
  canTransferByBankKey,
}: BanksProps) {
  const [editing, setEditing] = useState<EditingState>(null);
  const [saving, setSaving] = useState(false);
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceAdjustingAccount, setBalanceAdjustingAccount] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);
  const [bankToDelete, setBankToDelete] = useState<StoredBankCredentials | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<AccountDeleteState>(null);
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [autoSyncSaving, setAutoSyncSaving] = useState<string | null>(null);
  const [transferSaving, setTransferSaving] = useState<string | null>(null);

  const bankCount = useMemo(() => linkedBanks.length, [linkedBanks.length]);

  if (bankCount === 0) {
    return (
      <EmptyState
        title="Keine Bankverbindungen gespeichert"
        text="Um Transaktionen zu importieren, verbinde bitte mindestens eine Bankverbindung."
      />
    );
  }

  const isDirty = (accountName: string, holderName: string) =>
    Boolean(
      editing &&
      (editing.accountName.trim() !== accountName.trim() ||
        editing.holderName.trim() !== holderName.trim()),
    );

  const handleSaveAndDiscard = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateBankAccount(editing.scope, editing.iban, {
        account_name: editing.accountName,
        holder_name: editing.holderName.trim() || undefined,
      });
      setEditing(null);
      setDiscardChangesOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutoSync = async (scope: string, checked: boolean) => {
    setAutoSyncSaving(scope);
    onAutoSyncChange(scope, checked);
    try {
      await updateBankCredentials(scope, { auto_sync: checked });
    } catch {
      onAutoSyncChange(scope, !checked);
    } finally {
      setAutoSyncSaving(null);
    }
  };

  const handleToggleTransfer = async (
    scope: string,
    iban: string,
    accountKey: string,
    canTransfer: boolean,
    detected: boolean | null,
  ) => {
    setTransferSaving(accountKey);
    try {
      await updateBankAccount(scope, iban, {
        can_transfer_override: detected === canTransfer ? null : canTransfer,
      });
    } finally {
      setTransferSaving(null);
    }
  };

  const confirmDeleteBank = async () => {
    if (!bankToDelete) return;

    await onDeleteOne(bankToDelete.scope);
    setBankToDelete(null);
  };

  const confirmDeleteAccount = async () => {
    if (!accountToDelete) return;

    setDeletingAccount(accountToDelete.key);
    try {
      await deleteBankAccount(accountToDelete.scope, accountToDelete.iban);
      setAccountToDelete(null);
    } finally {
      setDeletingAccount(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm text-muted-foreground">
        {bankCount} verbundene Bank{bankCount !== 1 ? "en" : ""}
      </span>
      {balanceError ? <p className="text-sm text-destructive">{balanceError}</p> : null}
      {linkedBanks.map((bank) => {
        const accounts = getAccounts(bank, canTransferByBankKey?.get(bank.bank_key));

        return (
          <Card key={bank.scope} className="overflow-hidden gap-4 pt-4">
            {/* ── Bank header ── */}
            <CardHeader className="flex flex-row items-center gap-4 px-5">
              {/* Logo / Initials */}
              {bank.bank_logo ? (
                <BankLogo
                  src={bank.bank_logo || undefined}
                  alt={bank.account_name || bank.bank_name || "Bank"}
                  sizeClassName="size-12 shrink-0 p-1"
                  backgroundClassName="bg-muted/70"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-bold tracking-wide">
                  {bank.bank_name?.slice(0, 2)?.toUpperCase() ?? "BK"}
                </div>
              )}

              {/* Name + meta */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">
                  {bank.bank_name ?? bank.bank_key}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="bg-green-500/10 text-green-600 dark:text-green-400 text-[11px] px-1.5 py-0"
                  >
                    Aktiv
                  </Badge>
                  {canTransferByBankKey?.has(bank.bank_key) ? (
                    <Badge
                      variant="secondary"
                      className={
                        canTransferByBankKey.get(bank.bank_key)
                          ? "bg-green-500/10 text-green-600 dark:text-green-400 text-[11px] px-1.5 py-0"
                          : "bg-muted text-muted-foreground text-[11px] px-1.5 py-0"
                      }
                    >
                      {canTransferByBankKey.get(bank.bank_key)
                        ? "Überweisungen aktiv"
                        : "Überweisungen nicht unterstützt"}
                    </Badge>
                  ) : null}
                  {bank.username && (
                    <span className="text-xs text-muted-foreground">{bank.username}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    · {accounts.length} Kont{accounts.length !== 1 ? "en" : "o"}
                  </span>
                </div>
              </div>

              {/* Delete bank */}
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setBankToDelete(bank)}
                disabled={deletingScope === bank.scope}
              >
                {deletingScope === bank.scope ? "Lösche …" : "Zugang löschen"}
              </Button>
            </CardHeader>

            {/* ── Accounts list ── */}
            <CardContent className="px-0 pb-0">
              {bank.manual ? null : (
                <div className="border-b border-t px-5 py-3">
                  <ToggleRow
                    title="Automatische Synchronisation"
                    description={
                      bank.auto_sync !== false
                        ? "Wird automatisch im Hintergrund synchronisiert."
                        : "Wird nur noch manuell synchronisiert."
                    }
                    icon={<RefreshCw className="size-4" />}
                    size="sm"
                    checked={bank.auto_sync !== false}
                    disabled={autoSyncSaving === bank.scope}
                    pill={autoSyncSaving === bank.scope ? "…" : undefined}
                    onCheckedChange={(checked) => void handleToggleAutoSync(bank.scope, checked)}
                  />
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
                    <Info className="size-3.5 shrink-0" />
                    <span>
                      Auto-Sync-Deaktivierung ist empfohlen bei Banken, die für jede Aktion eine
                      TAN-Bestätigung benötigen.
                    </span>
                  </p>
                </div>
              )}
              <div className="divide-y">
                {accounts.map((account) => {
                  const accountKey = `${bank.scope}:${account.iban || account.account_name}`;
                  const isEditing = editing?.scope === bank.scope && editing?.iban === account.iban;

                  return (
                    <div key={accountKey} className="flex items-center gap-4 px-5 py-3">
                      {/* Indent indicator */}
                      <div className="w-px self-stretch bg-border ml-4 mr-1 shrink-0" />

                      <div className="flex flex-col gap-4">
                        {/* Account info */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight truncate">
                            {account.account_name || "Unbenanntes Konto"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground font-mono tracking-wide">
                            {formatIban(account.iban)}
                          </p>
                          <ToggleRow
                            title="Überweisungen möglich"
                            description={transferDescription(
                              account.can_transfer_detected,
                              account.can_transfer_override,
                            )}
                            color="amber"
                            size="sm"
                            fullWidth={false}
                            className="mt-1.5"
                            disabled={transferSaving === accountKey}
                            pill={transferSaving === accountKey ? "…" : undefined}
                            checked={account.can_transfer !== false}
                            onCheckedChange={(checked) =>
                              void handleToggleTransfer(
                                bank.scope,
                                account.iban,
                                accountKey,
                                checked,
                                account.can_transfer_detected,
                              )
                            }
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setEditing({
                                scope: bank.scope,
                                iban: account.iban,
                                accountName: account.account_name || "",
                                holderName: account.holder_name || "",
                              })
                            }
                          >
                            <Pencil className="!h-4 !w-4" />
                            <span>Bearbeiten</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              setAccountToDelete({
                                scope: bank.scope,
                                bankName: bank.bank_name ?? bank.bank_key,
                                iban: account.iban,
                                accountName: account.account_name || "Unbenanntes Konto",
                                key: accountKey,
                              })
                            }
                            disabled={deletingAccount === accountKey}
                          >
                            {deletingAccount === accountKey ? (
                              <Loader2 className="!h-4 !w-4 animate-spin" />
                            ) : (
                              <Trash2 className="!h-4 !w-4" />
                            )}
                            <span>{deletingAccount === accountKey ? "Lösche …" : "Löschen"}</span>
                          </Button>
                        </div>
                      </div>

                      {/* Edit dialog */}
                      <Dialog
                        open={isEditing}
                        onOpenChange={(open) => {
                          if (open) return;

                          if (isDirty(account.account_name || "", account.holder_name || "")) {
                            setDiscardChangesOpen(true);
                            return;
                          }

                          setEditing(null);
                        }}
                      >
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Konto bearbeiten</DialogTitle>
                            <DialogDescription>
                              Name und Kontoinhaber für dieses Konto ändern.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="account-name">
                              Kontoname
                            </label>
                            <Input
                              id="account-name"
                              value={editing?.accountName ?? ""}
                              onChange={(e) =>
                                setEditing((cur) =>
                                  cur ? { ...cur, accountName: e.target.value } : cur,
                                )
                              }
                              autoComplete="off"
                            />
                            <label className="text-sm font-medium" htmlFor="account-holder">
                              Kontoinhaber
                            </label>
                            <Input
                              id="account-holder"
                              value={editing?.holderName ?? ""}
                              onChange={(e) =>
                                setEditing((cur) =>
                                  cur ? { ...cur, holderName: e.target.value } : cur,
                                )
                              }
                              placeholder="z. B. Michael Tissen"
                              autoComplete="off"
                            />
                            <p className="text-xs text-muted-foreground">
                              Der Kontoinhaber wird als Empfängername bei Überweisungen an dieses
                              Konto verwendet (wichtig für den Namensabgleich der Bank). Er wird
                              automatisch aus den Bankdaten übernommen, sofern verfügbar.
                            </p>
                          </div>
                          <DialogFooter className="justify-end">
                            <Button
                              disabled={
                                saving ||
                                !isDirty(account.account_name || "", account.holder_name || "") ||
                                !editing?.accountName.trim()
                              }
                              onClick={async () => {
                                if (!editing) return;
                                setSaving(true);
                                try {
                                  await updateBankAccount(editing.scope, editing.iban, {
                                    account_name: editing.accountName,
                                    holder_name: editing.holderName.trim() || undefined,
                                  });
                                  setEditing(null);
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              {saving ? (
                                <Loader2 className="!h-4 !w-4 animate-spin" />
                              ) : (
                                <Check className="!h-4 !w-4" />
                              )}
                              <span>{saving ? "Speichere …" : "Speichern"}</span>
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <ConfirmDialog
        open={discardChangesOpen}
        title="Ungespeicherte Änderungen"
        description="Du hast ungespeicherte Änderungen. Was möchtest du tun?"
        confirmLabel="Verwerfen"
        saveLabel="Speichern"
        cancelLabel="Weiter bearbeiten"
        destructive={false}
        saving={saving}
        onSave={() => void handleSaveAndDiscard()}
        onOpenChange={(open) => {
          if (open) return;
          setDiscardChangesOpen(false);
        }}
        onConfirm={() => {
          setDiscardChangesOpen(false);
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(bankToDelete)}
        title="Bankzugang löschen"
        description={`Bankzugang "${bankToDelete?.bank_name ?? bankToDelete?.bank_key ?? ""}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        loading={bankToDelete ? deletingScope === bankToDelete.scope : false}
        onOpenChange={(open) => {
          if (!open) setBankToDelete(null);
        }}
        onConfirm={confirmDeleteBank}
      />
      <ConfirmDialog
        open={Boolean(accountToDelete)}
        title="Konto löschen"
        description={`Konto "${accountToDelete?.accountName ?? ""}" bei ${accountToDelete?.bankName ?? ""} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        loading={accountToDelete ? deletingAccount === accountToDelete.key : false}
        onOpenChange={(open) => {
          if (!open) setAccountToDelete(null);
        }}
        onConfirm={confirmDeleteAccount}
      />
    </div>
  );
}
