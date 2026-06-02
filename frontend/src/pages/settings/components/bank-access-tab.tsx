import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BankDefinition } from "@/lib/banks";
import type { StoredBankCredentials } from "@/lib/bank-credentials";
import { BankSelectionGrid } from "./bank-selection-grid";
import type { SettingsFormState } from "../types";
import { Banks } from "./banks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";

type BankAccessTabProps = {
  form: SettingsFormState;
  linkedAccounts: StoredBankCredentials[];
  availableBanks: BankDefinition[];
  deletingScope: string | null;
  isChecking: boolean;
  checkDialogOpen: boolean;
  checkMessage: string;
  checkError: string | null;
  onChange: <K extends keyof SettingsFormState>(
    field: K,
    value: SettingsFormState[K],
  ) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCloseCheckDialog: () => void;
  onDeleteOne: (scope: string) => void | Promise<void>;
};

export function BankAccessTab({
  form,
  linkedAccounts,
  availableBanks,
  deletingScope,
  isChecking,
  checkDialogOpen,
  checkMessage,
  checkError,
  onChange,
  onSubmit,
  onCloseCheckDialog,
  onDeleteOne,
}: BankAccessTabProps) {
  return (
    <div className="grid gap-6">
      <Card className="py-6">
        <CardHeader>
          <CardTitle>Bankzugangsdaten</CardTitle>
          <CardDescription>
            Hier kannst du dich mit deinen Banken verbinden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Bank</label>
              <BankSelectionGrid
                selectedKey={form.bank_key}
                onSelect={(bankKey) => onChange("bank_key", bankKey)}
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
                onChange={(event) => onChange("username", event.target.value)}
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
                onChange={(event) => onChange("pin", event.target.value)}
                placeholder="PIN"
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={isChecking}>
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

      <Dialog
        open={checkDialogOpen}
        onOpenChange={(open) => !open && onCloseCheckDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {checkError
                ? "Prüfung fehlgeschlagen"
                : "Bankzugang wird geprüft"}
            </DialogTitle>
            <DialogDescription>
              {checkError ? checkError : checkMessage || "Bitte warten ..."}
            </DialogDescription>
          </DialogHeader>
          {!checkError ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{checkMessage || "Verbindung wird getestet ..."}</span>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Möglicherweise musst du die Verbindung in deiner
                  Banking-App oder per TAN-Generator bestätigen.
                </span>
              </div>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button variant="outline" onClick={onCloseCheckDialog}>
              {checkError ? (
                <X className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              <span>{checkError ? "Schließen" : "OK"}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Banks
        linkedBanks={linkedAccounts}
        deletingScope={deletingScope}
        onDeleteOne={onDeleteOne}
      />
    </div>
  );
}
