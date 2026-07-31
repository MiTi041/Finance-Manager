import { useCallback, useEffect, useState } from "react";
import { PiggyBank, Loader2 } from "lucide-react";
import {
  fetchAllocationSettings,
  updateAllocationSettings,
  type AllocationSettings,
} from "@/lib/allocation";

export function AllocationSettingsTab() {
  const [settings, setSettings] = useState<AllocationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllocationSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einstellungen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleBafoeg = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAllocationSettings({ bafoeg_enabled: !settings.bafoeg_enabled });
      setSettings(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einstellung konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold mb-1">Allokation</h2>
      <p className="text-sm text-muted-foreground mb-6">Einstellungen für die Verteilung deines Einkommens.</p>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={settings?.bafoeg_enabled ?? false}
        disabled={saving}
        className={
          settings?.bafoeg_enabled
            ? "cursor-pointer flex w-full items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
            : "cursor-pointer flex w-full items-center justify-between rounded-lg border border-muted bg-muted/70 px-4 py-3 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
        }
        onClick={toggleBafoeg}
      >
        <div className="flex items-center gap-3">
          <PiggyBank className="size-5 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">BAföG-Rückzahlung</div>
            <div className="text-xs text-muted-foreground">
              BAföG-Bucket in der Allokation anzeigen und verwalten.
            </div>
          </div>
        </div>
        <span
          className={
            settings?.bafoeg_enabled
              ? "inline-flex items-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white"
              : "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          {saving ? "..." : settings?.bafoeg_enabled ? "Ja" : "Nein"}
        </span>
      </button>
    </div>
  );
}
