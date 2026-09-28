import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { SettingsTabHeader } from "@/components/settings-tab-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fetchAssistantConfig,
  fetchAssistantModels,
  updateAssistantConfig,
} from "@/lib/assistant";
import { ASSISTANT_CONFIG_CHANGED_EVENT } from "@/hooks/use-assistant-config";

export function AssistantTab() {
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434/v1");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const config = await fetchAssistantConfig();
      setEnabled(config.enabled);
      setBaseUrl(config.base_url);
      setModel(config.model);
      setHasApiKey(config.has_api_key);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Konfiguration konnte nicht geladen werden",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      const result = await fetchAssistantModels({
        base_url: baseUrl,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setModels(result);
      toast.success(`${result.length} Modelle gefunden`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verbindung fehlgeschlagen");
    } finally {
      setTesting(false);
    }
  }, [baseUrl, apiKey]);

  const save = useCallback(async () => {
    if (enabled && !model.trim()) {
      toast.error("Ohne Modell kann der Assistent nicht aktiviert werden.");
      return;
    }
    setSaving(true);
    try {
      const config = await updateAssistantConfig({
        enabled,
        base_url: baseUrl,
        model,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setHasApiKey(config.has_api_key);
      setApiKey("");
      window.dispatchEvent(new CustomEvent(ASSISTANT_CONFIG_CHANGED_EVENT));
      toast.success("KI-Einstellungen gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, [enabled, baseUrl, model, apiKey]);

  const clearApiKey = useCallback(async () => {
    setSaving(true);
    try {
      const config = await updateAssistantConfig({ api_key: "" });
      setHasApiKey(config.has_api_key);
      setApiKey("");
      window.dispatchEvent(new CustomEvent(ASSISTANT_CONFIG_CHANGED_EVENT));
      toast.success("API-Key entfernt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Entfernen fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <SettingsTabHeader
        title="KI-Assistent"
        description="Verbinde einen lokalen, OpenAI-kompatiblen Modell-Server (Ollama, LM Studio, llama.cpp)."
      />

      <div className="flex flex-col gap-4 rounded-lg border border-muted bg-muted/70 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Assistent aktiv</div>
            <div className="text-xs text-muted-foreground">
              Zeigt den KI-Chat in der Seitenleiste an.
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-base-url">Base-URL</Label>
          <Input
            id="ai-base-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://localhost:11434/v1"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-api-key">API-Key (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="ai-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasApiKey ? "•••••••• (gespeichert)" : "nur falls der Server einen braucht"}
            />
            {hasApiKey && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void clearApiKey()}
                disabled={saving}
              >
                Key entfernen
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-model">Modell</Label>
          <div className="flex gap-2">
            <Input
              id="ai-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="z. B. llama3.1:8b"
            />
            <Button variant="outline" onClick={() => void testConnection()} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : "Modelle laden"}
            </Button>
          </div>
          {models.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {models.map((name) => (
                <Button
                  key={name}
                  type="button"
                  variant={name === model ? "default" : "outline"}
                  size="sm"
                  onClick={() => setModel(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Speichern"}
          </Button>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        Alle Anfragen gehen ausschließlich an deinen lokalen Server. Es werden keine Daten an
        Cloud-Anbieter gesendet.
      </p>
    </div>
  );
}
