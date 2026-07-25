import { useState, useEffect, useRef } from "react";
import {
  getSyncStatus,
  setupSync,
  triggerSync,
  clearSync,
  recoverSync,
  type SyncStatus,
} from "@/lib/api/sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  KeyRound,
  Database,
  Fingerprint,
  Lock,
  ArrowRight,
  ShieldCheck,
  PlugZap,
  Sparkles,
} from "lucide-react";

function relativeTime(iso: string | null): string {
  if (!iso) return "Nie";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Gerade eben";
  if (mins < 60) return `Vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Vor ${hours} Std.`;
  return `Vor ${Math.floor(hours / 24)} Tagen`;
}

function formatEta(ms: number): string {
  if (ms < 2000) return "Gleich fertig";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `Ca. ${s} Sekunden`;
  const m = Math.ceil(s / 60);
  return m === 1 ? "Ca. 1 Minute" : `Ca. ${m} Minuten`;
}

function absoluteTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Small pill used to copy an ID (device id, key id, ...) */
function CopyField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available — silently ignore
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/70"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <code className="block truncate text-xs">{value}</code>
        </span>
      </span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-green-600" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

/** Password input with a show/hide toggle */
function PasswordField({
  value,
  onChange,
  autoFocus,
  minLength,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        autoFocus={autoFocus}
        className="pl-9 pr-9"
        placeholder="Mindestens 8 Zeichen"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="transition-all duration-150 ease-in-out cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function FieldLabel({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon: React.ElementType;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm font-medium">
      <Icon className="size-3.5 text-muted-foreground" />
      {children}
    </label>
  );
}

export function SyncTab() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [mode, setMode] = useState<"connect" | "new">("connect");

  const [password, setPassword] = useState("");
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKey, setR2AccessKey] = useState("");
  const [r2SecretKey, setR2SecretKey] = useState("");
  const [bucket, setBucket] = useState("finance-sync");

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollMsg, setPollMsg] = useState<string | null>(null);
  const [pollTitle, setPollTitle] = useState("Sync wird eingerichtet");
  const [progress, setProgress] = useState<number | null>(null);
  const [etaText, setEtaText] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  const pollCleanup = useRef<(() => void) | null>(null);
  const initialPendingRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const hasSeenPushRef = useRef(false);
  const hasSeenPullRef = useRef(false);

  const startPoll = (
    title = "Sync wird eingerichtet",
    initialMsg = "Verbinde mit Cloudflare R2 …",
  ) => {
    pollCleanup.current?.();
    setPollTitle(title);
    setPollMsg(initialMsg);
    setProgress(null);
    setEtaText(null);
    initialPendingRef.current = null;
    startTimeRef.current = Date.now();
    hasSeenPushRef.current = false;
    hasSeenPullRef.current = false;

    let cancelled = false;
    const complete = () => {
      cancelled = true;
      setPollMsg(null);
      refresh();
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const s = await getSyncStatus();
        if (cancelled) return;
        setStatus(s);

        if (s.pending_push > 0) hasSeenPushRef.current = true;
        if (s.pull_total > 0) hasSeenPullRef.current = true;

        if (initialPendingRef.current === null && s.pending_push > 0) {
          initialPendingRef.current = s.pending_push;
        }

        const elapsed = Date.now() - startTimeRef.current;

        // Progress: prefer pull when active, fall back to push
        let pct: number | null = null;
        if (s.pull_total > 0) {
          pct = Math.min((s.pull_progress / s.pull_total) * 100, 100);
        } else if (initialPendingRef.current !== null) {
          const total = initialPendingRef.current;
          const done = Math.max(0, total - s.pending_push);
          pct = Math.min((done / total) * 100, 100);
        }
        if (pct !== null) setProgress(pct);

        // ETA
        if (s.pull_total > 0 && s.pull_progress > 0 && s.pull_progress < s.pull_total) {
          const remaining = s.pull_total - s.pull_progress;
          if (elapsed > 2000) {
            const ratePerMs = s.pull_progress / elapsed;
            setEtaText(formatEta(remaining / ratePerMs));
          }
        } else if (initialPendingRef.current !== null && s.pending_push > 0) {
          const total = initialPendingRef.current;
          const done = Math.max(0, total - s.pending_push);
          if (done > 0 && elapsed > 2000) {
            const ratePerMs = done / elapsed;
            setEtaText(formatEta(s.pending_push / ratePerMs));
          }
        } else {
          setEtaText(null);
        }

        // Message
        if (s.pending_push > 0) {
          const suffix = s.pending_push === 1 ? "" : "en";
          setPollMsg(`${s.pending_push} Änderung${suffix} werden übertragen …`);
        } else if (s.pull_total > 0 && s.pull_progress < s.pull_total) {
          setPollMsg(`${s.pull_progress} von ${s.pull_total} Datenpaketen empfangen …`);
        } else if (hasSeenPushRef.current || hasSeenPullRef.current) {
          setPollMsg("Synchronisation wird abgeschlossen …");
        } else {
          setPollMsg("Warte auf Daten von anderen Geräten …");
        }

        // Completion
        if (s.configured) {
          const pushDone = s.pending_push === 0;
          const pullDone = s.pull_total === 0 || s.pull_progress >= s.pull_total;

          if (pushDone && pullDone) {
            if (hasSeenPushRef.current || hasSeenPullRef.current) {
              complete();
              return;
            }
            if (elapsed > 35000) {
              complete();
              return;
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync-Fehler");
        setPollMsg(null);
        return;
      }
      if (!cancelled) setTimeout(poll, 2000);
    };

    poll();
    pollCleanup.current = () => { cancelled = true; };
  };

  const refresh = () => {
    getSyncStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => {
      clearInterval(interval);
      pollCleanup.current?.();
    };
  }, []);

  const tryRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await recoverSync(password);
      startPoll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg || "Wiederherstellung fehlgeschlagen — bitte richte die Synchronisation neu ein.",
      );
      setMode("new");
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await setupSync({
        password,
        r2_account_id: r2AccountId,
        r2_access_key_id: r2AccessKey,
        r2_secret_access_key: r2SecretKey,
        r2_bucket: bucket,
      });
      startPoll();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Einrichtung fehlgeschlagen. Bitte Zugangsdaten prüfen.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerSync = async () => {
    setSyncing(true);
    setError(null);
    setJustSynced(false);
    try {
      await triggerSync();
      refresh();
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    setError(null);
    try {
      await clearSync();
      setStatus(null);
      setConfirmingClear(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen der Konfiguration");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------
  // Connecting / initial sync in progress
  // ---------------------------------------------------------------------
  if (pollMsg) {
    const isComplete = progress === 100;
    return (
      <Card className="overflow-hidden py-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="size-4 animate-pulse text-primary" />
            {pollTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 px-4 py-4">
            <div className="flex items-center gap-3">
              {isComplete ? (
                <Check className="size-5 shrink-0 text-green-600" />
              ) : (
                <div className="size-5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
              <span className="text-sm text-muted-foreground">{pollMsg}</span>
            </div>
            {progress !== null && (
              <div className="space-y-1.5">
                <Progress value={progress} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{Math.round(progress)}%</span>
                  {etaText && <span>{etaText}</span>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------
  // Configured — status dashboard
  // ---------------------------------------------------------------------
  if (status?.configured) {
    const hasPending = status.pending_push > 0;
    return (
      <Card className="overflow-hidden pb-6">
        <div
          className={`flex items-center gap-3 border-b px-6 py-4 ${
            status.running ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/30"
          }`}
        >
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-background shadow-sm">
            {status.running ? (
              <>
                <span className="absolute inset-2 animate-ping rounded-full bg-green-400/20 [animation-duration:2.5s]" />
                <Cloud className="size-4.5 text-green-600" />
              </>
            ) : (
              <CloudOff className="size-4.5 text-muted-foreground" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {status.running ? "Synchronisation aktiv" : "Synchronisation gestoppt"}
            </p>
            <p
              className="text-xs text-muted-foreground"
              title={absoluteTime(status.last_sync_at ?? null)}
            >
              Letzter Sync: {relativeTime(status.last_sync_at ?? null)}
            </p>
          </div>
          {hasPending && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-500" />
              {status.pending_push} ausstehend
            </span>
          )}
          {!hasPending && justSynced && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
              <Check className="size-3" />
              Aktuell
            </span>
          )}
        </div>

        <CardContent className="space-y-4">
          {error && <ErrorBanner message={error} />}

          <div className="grid gap-2 sm:grid-cols-2">
            <CopyField label="Geräte-ID" value={status.device_id} icon={Fingerprint} />
            {status.key_id && <CopyField label="Key-ID" value={status.key_id} icon={KeyRound} />}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={handleTriggerSync} disabled={syncing}>
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Wird synchronisiert …" : "Jetzt synchronisieren"}
            </Button>

            {!confirmingClear ? (
              <Button
                variant="outline"
                className="text-muted-foreground hover:text-red-600"
                onClick={() => setConfirmingClear(true)}
              >
                <Trash2 className="size-4" />
                Konfiguration löschen
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm dark:border-red-900/50 dark:bg-red-950/30">
                <span className="text-red-700 dark:text-red-400">Wirklich entfernen?</span>
                <Button size="sm" variant="destructive" onClick={handleClear} disabled={loading}>
                  {loading ? "Wird gelöscht …" : "Ja, löschen"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(false)}>
                  Abbrechen
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------
  // Not configured — connect existing / set up new
  // ---------------------------------------------------------------------
  return (
    <Card className="py-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugZap className="size-4 text-primary" />
          Sync einrichten
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Halte deine Daten geräteübergreifend über Cloudflare R2 auf dem neuesten Stand.
        </p>
      </CardHeader>
      <CardContent>
        {/* Segmented control */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => {
              setMode("connect");
              setError(null);
            }}
            className={`cursor-pointer flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
              mode === "connect"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="size-3.5" />
            Vorhandenes Konto
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("new");
              setError(null);
            }}
            className={`cursor-pointer flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
              mode === "new"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3.5" />
            Neu einrichten
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        {mode === "connect" ? (
          <form onSubmit={tryRecover} className="space-y-4">
            <div className="space-y-2">
              <FieldLabel icon={Lock}>Sync-Passwort</FieldLabel>
              <PasswordField value={password} onChange={setPassword} minLength={8} autoFocus />
              <p className="text-xs text-muted-foreground">
                Wurde die Synchronisation bereits auf einem anderen Gerät eingerichtet, reicht das
                Passwort zum Verbinden.
              </p>
            </div>
            <Button
              type="submit"
              disabled={loading || password.length < 8}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Wird wiederhergestellt …
                </>
              ) : (
                <>
                  Verbinden
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="space-y-2">
              <FieldLabel icon={Lock}>Sync-Passwort</FieldLabel>
              <PasswordField value={password} onChange={setPassword} minLength={8} />
              <p className="text-xs text-muted-foreground">
                Wird verwendet, um deine Daten Ende-zu-Ende zu verschlüsseln. Gut aufbewahren — ohne
                dieses Passwort ist keine Wiederherstellung möglich.
              </p>
            </div>

            <div className="rounded-lg border p-3.5">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Database className="size-3.5" />
                Cloudflare R2 Zugangsdaten
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Account ID</label>
                  <Input
                    value={r2AccountId}
                    onChange={(e) => setR2AccountId(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Access Key ID</label>
                    <Input
                      value={r2AccessKey}
                      onChange={(e) => setR2AccessKey(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Secret Access Key</label>
                    <PasswordField value={r2SecretKey} onChange={setR2SecretKey} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Bucket-Name</label>
                  <Input value={bucket} onChange={(e) => setBucket(e.target.value)} />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || password.length < 8}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Wird eingerichtet …
                </>
              ) : (
                <>
                  Sync aktivieren
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
