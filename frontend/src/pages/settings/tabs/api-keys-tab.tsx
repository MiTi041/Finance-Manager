import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsTabHeader } from "@/components/settings-tab-header";
import {
  fetchExternalKeys,
  updateExternalKeys,
  type ExternalKeys,
} from "@/lib/api-keys";

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ExternalKeys | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await fetchExternalKeys());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Schlüssel konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!keys) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateExternalKeys(keys);
      setKeys(updated);
      toast.success("Schlüssel gespeichert");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Schlüssel konnten nicht gespeichert werden";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [keys]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fields: Array<{
    key: keyof ExternalKeys;
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    help: string;
    password?: boolean;
  }> = [
    {
      key: "resend_api_key",
      label: "Resend API-Key",
      icon: <KeyRound className="size-5 text-muted-foreground" />,
      placeholder: "re_…",
      help: "Wird für automatische Warn-E-Mails genutzt (z. B. bei Überziehung).",
      password: true,
    },
    {
      key: "resend_from",
      label: "Resend Absender",
      icon: <KeyRound className="size-5 text-muted-foreground" />,
      placeholder: "Finance-Warnung <no-reply@example.com>",
      help: "Verifizierte Absender-Adresse bei Resend.",
    },
    {
      key: "hunter_logo_key",
      label: "Hunter API-Key",
      icon: <Search className="size-5 text-muted-foreground" />,
      placeholder: "…",
      help: "Wird genutzt, um automatisch Firmenlogos für Zahlungspartner zu laden.",
      password: true,
    },
  ];

  return (
    <div className="max-w-xl">
      <SettingsTabHeader
        title="API-Schlüssel"
        description="Hinterlege hier externe API-Schlüssel. In der Desktop-App kannst du keine Umgebungsvariablen ändern — alles wird in der Datenbank gespeichert."
      />

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      <div className="space-y-4">
        {fields.map(({ key, label, icon, placeholder, help, password }) => (
          <div
            key={key}
            className="flex flex-col gap-2 rounded-lg border border-muted bg-muted/70 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              {icon}
              <div className="flex-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{help}</div>
              </div>
            </div>
            <Input
              type={password ? "password" : "text"}
              value={keys?.[key] ?? ""}
              onChange={(e) => {
                setKeys((current) =>
                  current ? { ...current, [key]: e.target.value } : current,
                );
                setError(null);
              }}
              placeholder={placeholder}
              autoComplete="off"
            />
          </div>
        ))}

        <Button onClick={() => void save()} disabled={saving || !keys}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Speichern"}
        </Button>
      </div>
    </div>
  );
}