import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect, useState } from "react";
import { handleMailRegistration } from "@/lib/mail";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  KeyRound,
  Mail,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const API_BASE =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8112/api";

export function ProductIdTab() {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/product-id`)
      .then((res) => res.json())
      .then((data) => {
        if (data.product_id) {
          setValue(data.product_id);
          setIsConfigured(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const pid = value.trim();
    if (!pid) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/product-id`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: pid }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      setIsConfigured(true);
      setMessage({ type: "success", text: "Produkt-ID gespeichert." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message ?? "Verbindungsfehler" });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/product-id`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      setValue("");
      setIsConfigured(false);
      setMessage({ type: "success", text: "Produkt-ID entfernt." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message ?? "Verbindungsfehler" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6">
        <Card className="py-6">
          <CardContent>
            <p className="text-sm text-muted-foreground">Lade…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Card className="py-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <CardTitle>FinTS-Produkt-ID</CardTitle>
              <CardDescription>
                Wird für den sicheren Bankabruf per FinTS (HBCI) benötigt
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="z. B. 7FD7RCC1CP14CE8B35C59DD07"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                onClick={handleSave}
                disabled={
                  saving ||
                  !value.trim() ||
                  (isConfigured && value.trim() === value && !message)
                }
              >
                {saving
                  ? "Speichert…"
                  : isConfigured
                    ? "Aktualisieren"
                    : "Speichern"}
              </Button>
              {isConfigured && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClear}
                  className="text-destructive hover:text-destructive"
                  disabled={saving}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {message && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
                message.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400"
              }`}
            >
              <CheckCircle2
                className={`size-4 shrink-0 ${
                  message.type === "error" ? "text-red-500" : "text-emerald-500"
                }`}
              />
              <span>{message.text}</span>
            </div>
          )}

          {isConfigured && !message && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400">
              <CheckCircle2 className="size-4 shrink-0 text-blue-500" />
              <span>Produkt-ID ist hinterlegt. Bankabrufe sind aktiviert.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <FileText className="size-5" />
            </div>
            <div>
              <CardTitle>Registrierung</CardTitle>
              <CardDescription>
                Beantrage eine Produkt-ID und sende das Formular an die
                zuständige Stelle
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                1
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Formular herunterladen</p>
                <p className="text-xs text-muted-foreground">
                  Lade das offizielle Registrierungsformular von fints.org
                  herunter
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                2
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Ausgefüllt versenden</p>
                <p className="text-xs text-muted-foreground">
                  Sende das ausgefüllte Formular per E-Mail an die zentrale
                  Registrierungsstelle
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                3
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Erhaltene ID eintragen</p>
                <p className="text-xs text-muted-foreground">
                  Die Bearbeitung kann bis zu 2 Wochen dauern
                </p>
              </div>
            </li>
          </ol>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                window.open(
                  "https://www.fints.org/de/hersteller/produktregistrierung",
                  "_blank",
                )
              }
            >
              <ExternalLink className="size-4" />
              Zur Registrierung
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleMailRegistration()}
            >
              <Mail className="size-4" />
              Formular per E-Mail
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
