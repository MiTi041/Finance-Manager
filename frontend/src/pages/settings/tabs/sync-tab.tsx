import { useState, useEffect } from "react";
import { getSyncStatus, setupSync, triggerSync, clearSync, type SyncStatus } from "@/lib/api/sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SyncTab() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [password, setPassword] = useState("");
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKey, setR2AccessKey] = useState("");
  const [r2SecretKey, setR2SecretKey] = useState("");
  const [bucket, setBucket] = useState("finance-sync");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSyncStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
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
      setStatus({
        configured: true,
        running: true,
        device_id: "",
        key_id: null,
        r2_bucket: bucket,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await triggerSync();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen");
    } finally {
      setLoading(false);
    }
  };

  if (status?.configured) {
    return (
      <Card className="py-6">
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>Status: {status.running ? "Aktiv" : "Gestoppt"}</p>
          <p>
            Geräte-ID: <code className="text-xs">{status.device_id}</code>
          </p>
          {status.key_id && (
            <p>
              Key-ID: <code className="text-xs">{status.key_id}</code>
            </p>
          )}
          {status.r2_bucket && <p>Bucket: {status.r2_bucket}</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </CardContent>
        <div className="flex gap-2 px-6">
          <Button onClick={handleTriggerSync} disabled={syncing}>
            {syncing ? "Wird ausgeführt..." : "Sync jetzt ausführen"}
          </Button>
          <Button variant="outline" onClick={handleClear} disabled={loading}>
            Konfiguration löschen
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="py-6">
      <CardHeader>
        <CardTitle>Sync einrichten</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <form onSubmit={handleSetup} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Sync-Passwort</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">R2 Account ID</label>
            <Input value={r2AccountId} onChange={(e) => setR2AccountId(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">R2 Access Key ID</label>
            <Input value={r2AccessKey} onChange={(e) => setR2AccessKey(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">R2 Secret Access Key</label>
            <Input
              type="password"
              value={r2SecretKey}
              onChange={(e) => setR2SecretKey(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Bucket-Name</label>
            <Input value={bucket} onChange={(e) => setBucket(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Wird eingerichtet..." : "Sync aktivieren"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
