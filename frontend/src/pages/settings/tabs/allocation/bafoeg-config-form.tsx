import { useState, useEffect } from "react";
import type { BafoegConfig } from "@/lib/allocation";
import { fetchBafoegConfig, updateBafoegConfig } from "@/lib/allocation";
import { Button } from "@/components/ui/button";

export function BafoegConfigForm() {
  const [config, setConfig] = useState<BafoegConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchBafoegConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const handleSave = async () => {
    setSaving(true);
    await updateBafoegConfig(config);
    setSaving(false);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-card p-4">
      <h3 className="font-medium">Bafög-Konfiguration</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground">Gesamtschuld (€)</label>
          <input
            type="number"
            value={config.total_debt}
            onChange={(e) => setConfig({ ...config, total_debt: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Monatsrate (€)</label>
          <input
            type="number"
            value={config.monthly_rate}
            onChange={(e) => setConfig({ ...config, monthly_rate: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Zinssatz (%)</label>
          <input
            type="number"
            step={0.1}
            value={config.interest_rate}
            onChange={(e) => setConfig({ ...config, interest_rate: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Auszahlungsdatum</label>
          <input
            type="date"
            value={config.payout_date ?? ""}
            onChange={(e) => setConfig({ ...config, payout_date: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Speichert..." : "Speichern"}
      </Button>
    </div>
  );
}
