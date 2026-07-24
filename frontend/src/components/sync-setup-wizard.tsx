import { useState } from "react";
import { getSyncStatus, setupSync, recoverSync } from "@/lib/api/sync";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

const SKIP_KEY = "finance.sync.skipped";

export function hasSyncSkip(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SKIP_KEY) === "true";
}

export function markSyncSkipped(): void {
  window.localStorage.setItem(SKIP_KEY, "true");
}

type SetupMode = "idle" | "loading" | "recover" | "full";

export function SyncSetupWizard({ onComplete }: { onComplete: () => void }) {
  const [mode, setMode] = useState<SetupMode>("idle");
  const [password, setPassword] = useState("");
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKey, setR2AccessKey] = useState("");
  const [r2SecretKey, setR2SecretKey] = useState("");
  const [bucket, setBucket] = useState("finance-sync");
  const [error, setError] = useState<string | null>(null);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode !== "recover") {
      setMode("recover");
      return;
    }
    setError(null);
    try {
      await recoverSync(password);
      onComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("409")) {
        onComplete();
        return;
      }
      setError(msg || "Wiederherstellung fehlgeschlagen — bitte vollständig einrichten");
      setMode("full");
    }
  };

  const handleFullSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await setupSync({ password, r2_account_id: r2AccountId, r2_access_key_id: r2AccessKey, r2_secret_access_key: r2SecretKey, r2_bucket: bucket });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup fehlgeschlagen");
    }
  };

  const handleSkip = () => {
    markSyncSkipped();
    onComplete();
  };

  if (mode === "idle") {
    void getSyncStatus().then((s) => {
      if (s.configured) {
        onComplete();
      } else {
        setMode("recover");
      }
    }).catch(() => setMode("recover"));
    return null;
  }

  if (mode === "recover") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <form onSubmit={handleRecover} className="flex w-full max-w-md flex-col items-center gap-6 text-center">
          <h1 className="text-2xl font-bold">Sync einrichten</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Gib dein Sync-Passwort ein, um die bestehende Konfiguration wiederherzustellen.
            <br />Falls du noch keinen Sync eingerichtet hast, trage unten alle Zugangsdaten ein.
          </p>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Sync-Passwort"
            required
            minLength={8}
            className="w-full"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit">Einrichten</Button>
            <Button type="button" variant="outline" onClick={() => setMode("full")}>
              Neue Einrichtung
            </Button>
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Überspringen
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={handleFullSetup} className="flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sync einrichten</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Cloudflare R2-Zugangsdaten und Sync-Passwort eingeben
          </p>
        </div>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Sync-Passwort</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">R2 Account ID</label>
            <Input value={r2AccountId} onChange={e => setR2AccountId(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">R2 Access Key ID</label>
            <Input value={r2AccessKey} onChange={e => setR2AccessKey(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">R2 Secret Access Key</label>
            <Input type="password" value={r2SecretKey} onChange={e => setR2SecretKey(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Bucket-Name</label>
            <Input value={bucket} onChange={e => setBucket(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="submit" className="flex-1">Sync aktivieren</Button>
          <Button type="button" variant="ghost" onClick={handleSkip}>
            Überspringen
          </Button>
        </div>
      </form>
    </div>
  );
}
