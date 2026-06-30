import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BankDefinition } from "@/lib/bank/definitions";
import type { StoredBankCredentials } from "@/lib/bank/credentials";
import { BankSelectionGrid } from "./bank-selection-grid";
import { Banks } from "./banks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, ShieldCheck, Smartphone, X } from "lucide-react";
import {
  deleteBankCredentials,
  fetchAvailableBanks,
  fetchBankCredentials,
  fetchBankAccounts,
  saveBankCredentials,
  TanRequiredError,
} from "@/lib/bank/credentials";
import { hasFreshCache } from "@/lib/fetch-cache";
import { FINTS_SYNC_REQUEST_EVENT } from "@/lib/sync-events";

type SettingsFormState = {
  bank_key: string;
  username: string;
  pin: string;
};

const INITIAL_FORM_STATE: SettingsFormState = {
  bank_key: "",
  username: "",
  pin: "",
};

export function BankAccessTab() {
  const [form, setForm] = useState<SettingsFormState>(INITIAL_FORM_STATE);
  const [linkedAccounts, setLinkedAccounts] = useState<StoredBankCredentials[]>([]);
  const [availableBanks, setAvailableBanks] = useState<BankDefinition[]>([]);
  const [deletingScope, setDeletingScope] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkTanRequired, setCheckTanRequired] = useState<{
    decoupled: boolean;
    challenge: string | null;
  } | null>(null);
  const [checkIsWarning, setCheckIsWarning] = useState(false);

  const loadData = async (options?: { forceRefresh?: boolean }) => {
    const shouldShowLoading =
      options?.forceRefresh ||
      !(hasFreshCache("available-banks") && hasFreshCache("bank-credentials"));

    if (shouldShowLoading) {
      setAvailableBanks([]);
      setLinkedAccounts([]);
    }

    const [banks, credentials] = await Promise.all([
      fetchAvailableBanks({ forceRefresh: options?.forceRefresh }).catch(() => []),
      fetchBankCredentials({ forceRefresh: options?.forceRefresh }).catch(() => []),
    ]);

    setAvailableBanks(banks);
    setLinkedAccounts(credentials);
  };

  useEffect(() => {
    void loadData();

    const onCredentialsChanged = () => {
      void loadData({ forceRefresh: true });
    };

    window.addEventListener("finance-bank-credentials-changed", onCredentialsChanged);

    return () => {
      window.removeEventListener("finance-bank-credentials-changed", onCredentialsChanged);
    };
  }, []);

  const handleChange = <K extends keyof SettingsFormState>(
    field: K,
    value: SettingsFormState[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const closeDialog = () => {
    setCheckDialogOpen(false);
    setCheckError(null);
    setCheckTanRequired(null);
    setCheckMessage("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const hasDuplicateCredentials = linkedAccounts.some(
      (credential) =>
        credential.bank_key === form.bank_key && credential.username === form.username,
    );

    if (hasDuplicateCredentials) {
      setCheckError("Diese Anmeldedaten sind bereits hinterlegt.");
      setCheckDialogOpen(true);
      return;
    }

    setIsChecking(true);
    setCheckDialogOpen(true);
    setCheckError(null);
    setCheckTanRequired(null);
    setCheckIsWarning(false);
    setCheckMessage("Bankzugang wird gerade überprüft ...");

    const tanHintTimer = setTimeout(() => {
      setCheckIsWarning(true);
      setCheckMessage("Eventuell musst du die Verbindung in deiner Banking-App bestätigen.");
    }, 4000);

    try {
      const discoveredAccounts = await fetchBankAccounts({
        bank_key: form.bank_key,
        username: form.username,
        pin: form.pin,
      });

      setCheckMessage("Bankzugang ist gültig. Speichere jetzt ...");

      await saveBankCredentials({
        bank_key: form.bank_key,
        username: form.username,
        pin: form.pin,
        accounts: discoveredAccounts.accounts.map((account) => ({
          iban: account.iban,
          account_name: account.account_name ?? account.iban,
        })),
      });

      clearTimeout(tanHintTimer);
      setCheckIsWarning(false);
      setForm(INITIAL_FORM_STATE);
      setCheckDialogOpen(false);
      setCheckMessage("");

      await loadData({ forceRefresh: true });

      window.dispatchEvent(new CustomEvent(FINTS_SYNC_REQUEST_EVENT));
    } catch (error) {
      clearTimeout(tanHintTimer);
      setCheckIsWarning(false);
      if (error instanceof TanRequiredError) {
        setCheckTanRequired({
          decoupled: error.decoupled,
          challenge: error.challenge,
        });
        setCheckMessage("");
        return;
      }
      const message =
        error instanceof Error ? error.message : "Bankzugang konnte nicht geprüft werden.";
      setCheckError(message);
      setCheckMessage("");
    } finally {
      setIsChecking(false);
    }
  };

  const handleDeleteOne = async (scope: string) => {
    setDeletingScope(scope);
    try {
      await deleteBankCredentials(scope);
      await loadData({ forceRefresh: true });
    } finally {
      setDeletingScope(null);
    }
  };

  const canCheck =
    form.bank_key.trim() !== "" && form.username.trim() !== "" && form.pin.trim() !== "";

  return (
    <div className="grid gap-6">
      <Card className="py-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <CardTitle>Bankzugangsdaten</CardTitle>
              <CardDescription>Hier kannst du dich mit deinen Banken verbinden.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Bank</label>
              <BankSelectionGrid
                selectedKey={form.bank_key}
                onSelect={(bankKey) => handleChange("bank_key", bankKey)}
                banks={availableBanks}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="username">
                Anmeldename
              </label>
              <Input
                id="username"
                value={form.username}
                onChange={(event) => handleChange("username", event.target.value)}
                placeholder="Online-Banking-Login"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="pin">
                Anmelde-PIN
              </label>
              <Input
                id="pin"
                type="password"
                value={form.pin}
                onChange={(event) => handleChange("pin", event.target.value)}
                placeholder="PIN"
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={isChecking || !canCheck}>
                {isChecking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                <span>{isChecking ? "Prüfe ..." : "Prüfen"}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={checkDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {checkError
                ? "Prüfung fehlgeschlagen"
                : checkTanRequired
                  ? "TAN-Freigabe erforderlich"
                  : "Bankzugang wird geprüft"}
            </DialogTitle>
            <DialogDescription>
              {checkError
                ? checkError
                : checkTanRequired
                  ? "Bitte führe die TAN-Freigabe durch."
                  : checkMessage || "Bitte warten ..."}
            </DialogDescription>
          </DialogHeader>

          {checkTanRequired ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                <Smartphone className="h-5 w-5 shrink-0 mt-0.5 text-blue-500" />
                <div className="space-y-2">
                  <p className="font-semibold">
                    {checkTanRequired.decoupled ? "Bestätigung in der Banking-App" : "TAN eingeben"}
                  </p>
                  <p>
                    {checkTanRequired.decoupled
                      ? "Öffne deine Banking-App und bestätige die Verbindung. Der Vorgang wird automatisch fortgesetzt, sobald die Freigabe erteilt wurde."
                      : `Gib den folgenden Challenge-Code in deinem TAN-Generator ein:\n${checkTanRequired.challenge ?? "–"}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>Warte auf Freigabe ...</span>
              </div>
            </div>
          ) : !checkError ? (
            <div className="space-y-4">
              <div
                className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${checkIsWarning ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-muted/40"}`}
              >
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{checkMessage || "Verbindung wird getestet ..."}</span>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button variant="outline" onClick={closeDialog}>
              {checkError || checkTanRequired ? (
                <X className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              <span>{checkError ? "Schließen" : checkTanRequired ? "Abbrechen" : "OK"}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Banks
        linkedBanks={linkedAccounts}
        deletingScope={deletingScope}
        onDeleteOne={handleDeleteOne}
      />
    </div>
  );
}
