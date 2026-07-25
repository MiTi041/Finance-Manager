import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetchAllocationSettings, updateAllocationSettings } from "@/lib/allocation";
import { BafoegConfigForm } from "./bafoeg-config-form";

export function AllocationSettingsTab() {
  const [bafoegEnabled, setBafoegEnabled] = useState(false);

  const load = useCallback(async () => {
    const settings = await fetchAllocationSettings();
    setBafoegEnabled(settings.bafoeg_enabled);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggleBafoeg = async (enabled: boolean) => {
    await updateAllocationSettings({ bafoeg_enabled: enabled });
    setBafoegEnabled(enabled);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch
          id="bafoeg-toggle"
          checked={bafoegEnabled}
          onCheckedChange={handleToggleBafoeg}
        />
        <Label htmlFor="bafoeg-toggle">Bafög-Modus aktivieren</Label>
      </div>

      {bafoegEnabled && <BafoegConfigForm />}
    </div>
  );
}
