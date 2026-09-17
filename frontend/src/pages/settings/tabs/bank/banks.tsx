import { useMemo, useState } from "react";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteBankAccount,
  adjustBankAccountBalance,
  type StoredBankCredentials,
  updateBankAccount,
  updateBankCredentials,
} from "@/lib/bank/credentials";
import { EmptyState } from "@/components/empty-state";
import {
  AlertTriangle,
  Archive,
  Check,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { BankLogo } from "@/components/bank-logo";
import { ToggleRow } from "@/components/toggle-row";
import { useRefresh } from "@/hooks/use-refresh";
import { migrateTransactionsToAccount } from "@/lib/transactions";

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
  archived: boolean;
} | null;

type AccountDeleteState = {
  scope: string;
  bankName: string;
  iban: string;
  accountName: string;
  key: string;
} | null;

type MigrationFollowUpState = {
  scope: string;
  iban: string;
  accountName: string;
  bankName: string;
  key: string;
} | null;

function formatIban(value?: string) {
  if (!value) return "—";
  // Insert a space every 4 chars for readability: DE89 3704 0044 0532 0130 00
  return value.trim().replace(/(.{4})(?=.)/g, "$1 ");
}

function transferDescription(detected: boolean | null, override: boolean | null) {
  const detectedLabel = detected == null ? "keine Angabe" : detected ? "möglich" : "nicht möglich";
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
      archived: account.archived === true,
      migrated_to_iban: account.migrated_to_iban ?? null,
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
      archived: false,
      migrated_to_iban: null,
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
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationSource, setMigrationSource] = useState("");
  const [migrationTarget, setMigrationTarget] = useState("");
  const [migrationSaving, setMigrationSaving] = useState(false);
  const [migrationFollowUp, setMigrationFollowUp] = useState<MigrationFollowUpState>(null);
  const { triggerRefresh } = useRefresh();

  const bankCount = useMemo(() => linkedBanks.length, [linkedBanks.length]);
  const migrationAccounts = useMemo(
    () =>
      linkedBanks.flatMap((bank) =>
        getAccounts(bank, canTransferByBankKey?.get(bank.bank_key))
          .filter((account) => account.iban && !account.archived)
          .map((account) => ({
            iban: account.iban,
            label: `${bank.bank_name ?? bank.bank_key} · ${account.account_name || formatIban(account.iban)}`,
            bankName: bank.bank_name ?? bank.bank_key,
            scope: bank.scope,
            accountName: account.account_name || "Unbenanntes Konto",
          })),
      ),
    [canTransferByBankKey, linkedBanks],
  );
  const accountLabelsByIban = useMemo(
    () => new Map(migrationAccounts.map((account) => [account.iban, account.label])),
    [migrationAccounts],
  );

  if (bankCount === 0) {
    return (
      <EmptyState
        title="Keine Bankverbindungen gespeichert"
        text="Um Transaktionen zu importieren, verbinde bitte mindestens eine Bankverbindung."
      />
    );
  }

  const canMigrate = Boolean(
    migrationSource && migrationTarget && migrationSource !== migrationTarget,
  );

  const closeMigration = () => {
    if (migrationSaving) return;
    setMigrationOpen(false);
    setMigrationSource("");
    setMigrationTarget("");
  };

  const submitMigration = async () => {
    if (!canMigrate) return;
    setMigrationSaving(true);
    try {
      const source = migrationAccounts.find((account) => account.iban === migrationSource);
      const result = await migrateTransactionsToAccount({
        source_iban: migrationSource,
        target_iban: migrationTarget,
        from_date: null,
        to_date: null,
        origin_bank_name: source?.bankName,
      });
      toast.success(`${result.migrated} Buchungen wurden dem neuen Konto zugeordnet.`);
      closeMigration();
      if (source) {
        setMigrationFollowUp({
          scope: source.scope,
          iban: source.iban,
          accountName: source.accountName,
          bankName: source.bankName,
          key: `${source.scope}:${source.iban}`,
        });
      } else {
        triggerRefresh();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Die Kontomigration ist fehlgeschlagen.",
      );
    } finally {
      setMigrationSaving(false);
    }
  };

  const finishMigrationFollowUp = async (action: "delete" | "archive" | "keep") => {
    if (!migrationFollowUp) return;

    setDeletingAccount(action === "delete" ? migrationFollowUp.key : null);
    try {
      if (action === "delete") {
        await deleteBankAccount(migrationFollowUp.scope, migrationFollowUp.iban);
        toast.success("Das alte Konto wurde gelöscht.");
      } else if (action === "archive") {
        await updateBankAccount(migrationFollowUp.scope, migrationFollowUp.iban, {
          archived: true,
        });
        toast.success("Das alte Konto wurde archiviert.");
      }
      setMigrationFollowUp(null);
      triggerRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Die Folgeaktion ist fehlgeschlagen.");
    } finally {
      setDeletingAccount(null);
    }
  };

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
      {migrationAccounts.length >= 2 ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setMigrationOpen(true)}>
            <RefreshCw className="!h-4 !w-4" />
            Historische Buchungen übertragen
          </Button>
        </div>
      ) : null}
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
              {bank.manual ||
              !accounts.some((account) => !account.archived && account.iban) ? null : (
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
                    <div
                      key={accountKey}
                      className={`flex items-center gap-4 px-5 py-3 ${
                        account.archived ? "bg-amber-500/5" : ""
                      }`}
                    >
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
                          {account.archived || account.migrated_to_iban ? (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                              {account.archived ? (
                                <Badge className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                  Archiviert
                                </Badge>
                              ) : null}
                              {account.migrated_to_iban ? (
                                <span className="text-muted-foreground">
                                  Migriert zu:{" "}
                                  {accountLabelsByIban.get(account.migrated_to_iban) ??
                                    formatIban(account.migrated_to_iban)}
                                </span>
                              ) : account.archived ? (
                                <span className="text-muted-foreground">
                                  Nicht mehr synchronisiert
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {bank.manual || account.archived ? null : (
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
                          )}
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
                                archived: account.archived,
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
                              placeholder="z. B. Max Mustermann"
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
                              variant="outline"
                              disabled={saving}
                              onClick={async () => {
                                if (!editing) return;
                                setSaving(true);
                                try {
                                  await updateBankAccount(editing.scope, editing.iban, {
                                    archived: !editing.archived,
                                  });
                                  setEditing(null);
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              {saving ? (
                                <Loader2 className="!h-4 !w-4 animate-spin" />
                              ) : editing?.archived ? (
                                <RefreshCw className="!h-4 !w-4" />
                              ) : (
                                <Archive className="!h-4 !w-4" />
                              )}
                              <span>
                                {saving
                                  ? editing?.archived
                                    ? "Stelle wieder her …"
                                    : "Archiviere …"
                                  : editing?.archived
                                    ? "Archivierung aufheben"
                                    : "Archivieren"}
                              </span>
                            </Button>
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
      <Dialog
        open={migrationOpen}
        onOpenChange={(open) => (open ? setMigrationOpen(true) : closeMigration())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Historische Buchungen übertragen</DialogTitle>
            <DialogDescription>
              Ordne Buchungen aus einem alten Konto dem neuen Hauptkonto zu. Für Kontowechsel
              gedacht.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="migration-source">
                Altes Konto
              </label>
              <Select value={migrationSource} onValueChange={setMigrationSource}>
                <SelectTrigger id="migration-source" className="w-full">
                  <SelectValue placeholder="Konto auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {migrationAccounts.map((account) => (
                    <SelectItem key={`source-${account.iban}`} value={account.iban}>
                      {account.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="migration-target">
                Neues Hauptkonto
              </label>
              <Select value={migrationTarget} onValueChange={setMigrationTarget}>
                <SelectTrigger id="migration-target" className="w-full">
                  <SelectValue placeholder="Konto auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {migrationAccounts.map((account) => (
                    <SelectItem key={`target-${account.iban}`} value={account.iban}>
                      {account.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 rounded-control border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Jede migrierte Transaktion wird gekennzeichnet, sodass du die alten von den neuen
                unterscheiden kannst.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeMigration} disabled={migrationSaving}>
              Abbrechen
            </Button>
            <Button
              onClick={() => void submitMigration()}
              disabled={!canMigrate || migrationSaving}
            >
              {migrationSaving ? (
                <Loader2 className="!h-4 !w-4 animate-spin" />
              ) : (
                <Check className="!h-4 !w-4" />
              )}
              {migrationSaving ? "Übertrage …" : "Buchungen übertragen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(migrationFollowUp)}
        onOpenChange={(open) => {
          if (!open && !deletingAccount) {
            setMigrationFollowUp(null);
            triggerRefresh();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Was soll mit dem alten Konto passieren?</DialogTitle>
            <DialogDescription>
              Die Buchungen wurden übertragen. Für das alte Konto „{migrationFollowUp?.accountName}"
              bei {migrationFollowUp?.bankName} kannst du jetzt eine Folgeaktion auswählen.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="justify-start"
              disabled={Boolean(deletingAccount)}
              onClick={() => void finishMigrationFollowUp("archive")}
            >
              Archivieren
              <span className="ml-auto text-xs text-muted-foreground">
                Aus Kontoauswahl und weiteren Migrationen ausblenden
              </span>
            </Button>
            <Button
              variant="destructive"
              className="justify-start"
              disabled={Boolean(deletingAccount)}
              onClick={() => void finishMigrationFollowUp("delete")}
            >
              {deletingAccount ? <Loader2 className="!h-4 !w-4 animate-spin" /> : null}
              Konto löschen
            </Button>
            <Button
              variant="ghost"
              className="justify-start"
              disabled={Boolean(deletingAccount)}
              onClick={() => void finishMigrationFollowUp("keep")}
            >
              Beibehalten
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
