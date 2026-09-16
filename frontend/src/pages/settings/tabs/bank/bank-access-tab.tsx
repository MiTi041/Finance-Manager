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
import { CheckCircle2, Eye, EyeOff, Loader2, Plus, ShieldCheck, Smartphone, Timer, X } from "lucide-react";
import {
  deleteBankCredentials,
  fetchAvailableBanks,
  fetchBankCredentials,
  fetchBankAccounts,
  saveBankCredentials,
  TanRequiredError,
} from "@/lib/bank/credentials";
import { FINTS_SYNC_REQUEST_EVENT } from "@/lib/sync-events";
import { normalizeIban } from "@/lib/iban";
import { RateLimitError } from "@/lib/upload-helper";

type SettingsFormState = {
  bank_key: string;
  username: string;
  pin: string;
  tan_medium: string;
  manual_account_name: string;
  manual_iban: string;
};

const INITIAL_FORM_STATE: SettingsFormState = {
  bank_key: "",
  username: "",
  pin: "",
  tan_medium: "",
  manual_account_name: "",
  manual_iban: "",
};

const COOLDOWN_STORAGE_KEY = "finance-bank-check-cooldowns";

function readCooldowns(): Record<string, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COOLDOWN_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCooldowns(cooldowns: Record<string, number>) {
  window.localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
}

function secondsLeft(until: number): number {
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

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
  const [checkTanInput, setCheckTanInput] = useState("");
  const [checkIsWarning, setCheckIsWarning] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>(readCooldowns);
  const [cooldown, setCooldown] = useState(0);
  const [showPin, setShowPin] = useState(false);

  const cooldownUntil = cooldowns[form.bank_key] ?? 0;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = () => {
      const left = secondsLeft(cooldownUntil);
      setCooldown(left);
      if (left <= 0 && cooldownUntil > 0) {
        if (timer) clearInterval(timer);
        setCooldowns((current) => {
          if (!(form.bank_key in current)) return current;
          const next = { ...current };
          delete next[form.bank_key];
          writeCooldowns(next);
          return next;
        });
      }
    };

    tick();
    if (cooldownUntil > Date.now()) timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil, form.bank_key]);

  const loadData = async (options?: { forceRefresh?: boolean }) => {
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
    setCheckTanInput("");
  };

  const runCheck = async (tan?: string) => {
    setIsChecking(true);
    setCheckDialogOpen(true);
    setCheckError(null);
    setCheckTanRequired(null);
    setCheckTanInput("");
    setCheckIsWarning(false);
    setCheckMessage("Bankzugang wird gerade überprüft ...");

    const tanHintTimer = setTimeout(() => {
      setCheckIsWarning(true);
      setCheckMessage("Eventuell musst du die Verbindung in deiner Banking-App bestätigen.");
    }, 4000);

    try {
      const discoveredAccounts = await fetchBankAccounts(
        {
          bank_key: form.bank_key,
          username: form.username,
          pin: form.pin,
          tan_medium: form.tan_medium.trim() || undefined,
        },
        tan,
      );

      setCheckMessage("Bankzugang ist gültig. Speichere jetzt ...");

      await saveBankCredentials({
        bank_key: form.bank_key,
        username: form.username,
        pin: form.pin,
        tan_medium: form.tan_medium.trim() || undefined,
        accounts: discoveredAccounts.accounts.map((account) => ({
          iban: account.iban,
          account_name: account.account_name ?? account.product_name ?? account.iban,
          holder_name: account.holder_name,
          can_transfer: account.can_transfer ?? null,
        })),
      });

      clearTimeout(tanHintTimer);
      setCheckIsWarning(false);
      setForm(INITIAL_FORM_STATE);
      setCheckDialogOpen(false);
      setCheckMessage("");
      setCheckTanInput("");

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
      if (error instanceof RateLimitError) {
        const until = Date.now() + error.retryAfter * 1000;
        setCooldowns((current) => {
          const next = { ...current, [form.bank_key]: until };
          writeCooldowns(next);
          return next;
        });
        setCheckDialogOpen(false);
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

  const handleManualSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const accountName = form.manual_account_name.trim();
    const iban = normalizeIban(form.manual_iban);
    if (!accountName || !iban) return;

    setIsChecking(true);
    try {
      await saveBankCredentials({
        bank_key: "manual",
        account_name: accountName,
        username: "",
        pin: "",
        accounts: [{ iban, account_name: accountName, can_transfer: false }],
      });
      setForm(INITIAL_FORM_STATE);
      await loadData({ forceRefresh: true });
    } catch (error) {
      setCheckError(
        error instanceof Error ? error.message : "Manueller Bankzugang konnte nicht gespeichert werden.",
      );
      setCheckDialogOpen(true);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (form.bank_key === "manual") {
      await handleManualSubmit(event);
      return;
    }

    const hasDuplicateCredentials = linkedAccounts.some(
      (credential) =>
        credential.bank_key === form.bank_key && credential.username === form.username,
    );

    if (hasDuplicateCredentials) {
      setCheckError("Diese Anmeldedaten sind bereits hinterlegt.");
      setCheckDialogOpen(true);
      return;
    }

    await runCheck();
  };

  const handleTanSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tan = checkTanInput.trim();
    if (!tan) return;
    await runCheck(tan);
  };

  const handleAutoSyncChange = (scope: string, checked: boolean) => {
    setLinkedAccounts((current) =>
      current.map((credential) =>
        credential.scope === scope ? { ...credential, auto_sync: checked } : credential,
      ),
    );
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

  const selectedBank = availableBanks.find((bank) => bank.key === form.bank_key);
  const isManual = form.bank_key === "manual";

  const canCheck =
    form.bank_key.trim() !== "" &&
    form.username.trim() !== "" &&
    form.pin.trim() !== "" &&
    (!selectedBank?.needs_tan_medium_name || form.tan_medium.trim() !== "");

  const canSubmit = isManual
    ? form.manual_account_name.trim() !== "" && normalizeIban(form.manual_iban) !== ""
    : canCheck;

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

            {isManual ? (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="manual_account_name">
                    Kontoname
                  </label>
                  <Input
                    id="manual_account_name"
                    value={form.manual_account_name}
                    onChange={(event) => handleChange("manual_account_name", event.target.value)}
                    placeholder="z. B. Bargeld"
                    autoComplete="off"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="manual_iban">
                    IBAN
                  </label>
                  <Input
                    id="manual_iban"
                    value={form.manual_iban}
                    onChange={(event) => handleChange("manual_iban", event.target.value)}
                    placeholder="DE00 0000 0000 0000 0000 00"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Alle manuellen Konten erscheinen unter dem Bankzugang „Manuell“. Transaktionen
                    fügst du dort selbst auf der Transaktionsseite hinzu.
                  </p>
                </div>
              </>
            ) : (
              <>
                {selectedBank?.needs_tan_medium_name ? (
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="tan_medium">
                      TAN-Medium-Name (BestSign-Push)
                    </label>
                    <Input
                      id="tan_medium"
                      value={form.tan_medium}
                      onChange={(event) => handleChange("tan_medium", event.target.value)}
                      placeholder="z. B. Michis IPhone"
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      Die Norisbank verlangt den Namen deines registrierten BestSign-Push-Geräts. Du
                      findest ihn in der Norisbank-App bzw. im Online-Banking unter TAN-Verwaltung.
                    </p>
                  </div>
                ) : null}

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
                  {selectedBank?.username_hint ? (
                    <p className="text-xs text-muted-foreground">{selectedBank.username_hint}</p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="pin">
                    Anmelde-PIN
                  </label>
                  <div className="relative">
                    <Input
                      id="pin"
                      type={showPin ? "text" : "password"}
                      value={form.pin}
                      onChange={(event) => handleChange("pin", event.target.value)}
                      placeholder="PIN"
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={showPin ? "PIN verbergen" : "PIN anzeigen"}
                      tabIndex={-1}
                    >
                      {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {cooldown > 0 ? (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <Timer className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">Bitte warte noch {cooldown}s</p>
                  <p>
                    Zwischen zwei Prüfungen ist eine kurze Pause nötig, damit deine Bank nicht
                    überlastet wird.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={isChecking || !canSubmit || cooldown > 0}>
                {isChecking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : cooldown > 0 ? (
                  <Timer className="size-4" />
                ) : isManual ? (
                  <Plus className="size-4" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                <span>
                  {isChecking
                    ? isManual
                      ? "Speichere ..."
                      : "Prüfe ..."
                    : cooldown > 0
                      ? `${cooldown}s`
                      : isManual
                        ? "Hinzufügen"
                        : "Prüfen"}
                </span>
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
                      : checkTanRequired.challenge ||
                        "Bitte generiere eine TAN und gib sie hier ein."}
                  </p>
                </div>
              </div>
              {checkTanRequired.decoupled ? (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Warte auf Freigabe ...</span>
                </div>
              ) : (
                <form className="flex items-center gap-3" onSubmit={handleTanSubmit}>
                  <Input
                    value={checkTanInput}
                    onChange={(event) => setCheckTanInput(event.target.value)}
                    placeholder="TAN"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                  <Button type="submit" disabled={isChecking || checkTanInput.trim() === ""}>
                    {isChecking ? <Loader2 className="size-4 animate-spin" /> : null}
                    <span>TAN senden</span>
                  </Button>
                </form>
              )}
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
        onAutoSyncChange={handleAutoSyncChange}
        canTransferByBankKey={new Map(availableBanks.map((bank) => [bank.key, bank.can_transfer]))}
      />
    </div>
  );
}
