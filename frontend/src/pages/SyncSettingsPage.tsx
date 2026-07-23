import { useState, useEffect } from "react";
import { getSyncStatus, setupSync, triggerSync, clearSync } from "@/lib/api/sync";
import type { SyncStatus } from "@/lib/api/sync";

export default function SyncSettingsPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [password, setPassword] = useState("");
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKey, setR2AccessKey] = useState("");
  const [r2SecretKey, setR2SecretKey] = useState("");
  const [bucket, setBucket] = useState("finance-sync");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSyncStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

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
      setStatus({ ...status!, configured: true, running: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    setError(null);
    try {
      await clearSync();
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen");
    } finally {
      setLoading(false);
    }
  };

  if (status?.configured) {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Sync</h1>
        <div className="rounded-lg border p-4 space-y-2">
          <p>Status: {status.running ? "Aktiv" : "Gestoppt"}</p>
          <p>Geräte-ID: <code className="text-xs">{status.device_id}</code></p>
          {status.key_id && <p>Key-ID: <code className="text-xs">{status.key_id}</code></p>}
          {status.r2_bucket && <p>Bucket: {status.r2_bucket}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => triggerSync()}
            className="rounded bg-primary px-4 py-2 text-white"
          >
            Sync jetzt ausführen
          </button>
          <button
            onClick={handleClear}
            className="rounded border px-4 py-2 text-muted-foreground"
          >
            Konfiguration löschen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Sync einrichten</h1>
      {error && <div className="rounded bg-red-100 p-3 text-red-700">{error}</div>}
      <form onSubmit={handleSetup} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Sync-Passwort</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border p-2"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">R2 Account ID</label>
          <input
            value={r2AccountId}
            onChange={(e) => setR2AccountId(e.target.value)}
            className="w-full rounded border p-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">R2 Access Key ID</label>
          <input
            value={r2AccessKey}
            onChange={(e) => setR2AccessKey(e.target.value)}
            className="w-full rounded border p-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">R2 Secret Access Key</label>
          <input
            type="password"
            value={r2SecretKey}
            onChange={(e) => setR2SecretKey(e.target.value)}
            className="w-full rounded border p-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Bucket-Name</label>
          <input
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="w-full rounded border p-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Wird eingerichtet..." : "Sync aktivieren"}
        </button>
      </form>
    </div>
  );
}
