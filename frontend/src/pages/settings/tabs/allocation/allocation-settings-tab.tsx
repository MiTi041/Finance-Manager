import { useCallback, useEffect, useState } from "react";
import {
  PiggyBank,
  Loader2,
  CalendarDays,
  ShieldCheck,
  TrendingUp,
  Heart,
  Wallet,
} from "lucide-react";
import { ToggleRow } from "@/components/toggle-row";
import {
  fetchAllocationSettings,
  updateAllocationSettings,
  fetchAllocationBuckets,
  updateAllocationBucket,
  type AllocationSettings,
  type AllocationBucket,
} from "@/lib/allocation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const bucketLabels: Record<string, string> = {
  emergency: "Notgroschen",
  invest: "Investieren",
  donation: "Spenden",
  spending: "Restliche Ausgaben",
};

const bucketIcons: Record<string, React.ReactNode> = {
  emergency: <ShieldCheck className="size-5" />,
  invest: <TrendingUp className="size-5" />,
  donation: <Heart className="size-5" />,
  spending: <Wallet className="size-5" />,
};

export function AllocationSettingsTab() {
  const [settings, setSettings] = useState<AllocationSettings | null>(null);
  const [buckets, setBuckets] = useState<AllocationBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, bucketList] = await Promise.all([
        fetchAllocationSettings(),
        fetchAllocationBuckets(),
      ]);
      setSettings(data);
      setBuckets(bucketList);
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

  const toggleBucket = useCallback(async (bucket: AllocationBucket) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAllocationBucket(bucket.id, { is_active: !bucket.is_active });
      setBuckets((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einstellung konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }, []);

  const changeHolidayState = useCallback(async (state: string) => {
    if (!settings || state === settings.holiday_state) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAllocationSettings({ holiday_state: state });
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

      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-muted bg-muted/70 px-4 py-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium">Feiertags-Bundesland</div>
            <div className="text-xs text-muted-foreground">
              Gehalt wird am letzten Arbeitstag des Monats gezahlt (bei Wochenende oder Feiertag
              vorgezogen). Welche Feiertage gelten, hängt vom Bundesland deines Arbeitgebers ab.
              Diese Einstellung beeinflusst, wie dein Gehaltstag erkannt wird und wie viele
              Einkommen bis zum Zieldatum deiner Sparpläne eingehen.
            </div>
          </div>
        </div>
        <Select
          value={settings?.holiday_state ?? "nw"}
          onValueChange={changeHolidayState}
          disabled={saving}
        >
          <SelectTrigger id="holiday-state" className="w-full">
            <SelectValue placeholder="Bundesland wählen" />
          </SelectTrigger>
          <SelectContent>
            {(settings?.holiday_states ?? []).map((state) => (
              <SelectItem key={state.code} value={state.code}>
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ToggleRow
        title="BAföG-Rückzahlung"
        description="BAföG-Bucket in der Allokation anzeigen und verwalten."
        icon={<PiggyBank className="size-5" />}
        checked={settings?.bafoeg_enabled ?? false}
        onCheckedChange={() => void toggleBafoeg()}
        disabled={saving}
        pill={saving ? "..." : undefined}
      />

      <div className="mt-6 flex flex-col gap-2">
        {buckets
          .filter((b) => b.bucket_type !== "bafoeg")
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((bucket) => (
            <ToggleRow
              key={bucket.id}
              title={bucketLabels[bucket.bucket_type] ?? bucket.bucket_type}
              description="Bucket in der Allokation anzeigen."
              icon={bucketIcons[bucket.bucket_type]}
              checked={bucket.is_active}
              onCheckedChange={() => void toggleBucket(bucket)}
              disabled={saving}
            />
          ))}
      </div>
    </div>
  );
}
