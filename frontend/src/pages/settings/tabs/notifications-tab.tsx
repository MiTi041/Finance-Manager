import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  fetchNotifications,
  updateNotifications,
} from "@/lib/notifications";

export function NotificationsTab() {
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotifications();
      setEmail(data.email);
      setSavedEmail(data.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einstellung konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateNotifications(email);
      setSavedEmail(updated.email);
      setEmail(updated.email);
      toast.success("E-Mail-Adresse gespeichert");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "E-Mail-Adresse konnte nicht gespeichert werden";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [email]);

  const dirty = email.trim() !== savedEmail;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold mb-1">Benachrichtigungen</h2>
      <p className="text-sm text-muted-foreground mb-6">
        E-Mail-Adresse für automatische Warnungen.
      </p>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      <div className="flex flex-col gap-2 rounded-lg border border-muted bg-muted/70 px-4 py-3">
        <div className="flex items-center gap-3">
          <Bell className="size-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium">Warn-E-Mail</div>
            <div className="text-xs text-muted-foreground">
              Diese Adresse wird für Benachrichtigungen genutzt, z. B. wenn vorgemerkte
              Umsätze das Kontoguthaben übersteigen. Es wird nur diese eine Art von
              Warn-E-Mail versendet.
            </div>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="name@example.com"
              className="pl-9"
            />
          </div>
          <Button onClick={() => void save()} disabled={saving || !dirty || !email.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Speichern"}
          </Button>
        </div>
      </div>
    </div>
  );
}