import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const API_BASE =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8112/api";
const STORAGE_KEY = "finance.product-id.v1";

export function ProductIdSettings() {
  const [value, setValue] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
      localStorage.setItem(STORAGE_KEY, pid);
      setMessage({ type: "success", text: "Produkt-ID gespeichert." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message ?? "Verbindungsfehler" });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setValue("");
    setMessage({ type: "success", text: "Produkt-ID entfernt." });
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">FinTS-Produkt-ID</h2>
        <p className="text-muted-foreground text-sm">
          Wird für den Bankabruf per FinTS benötigt. Registrierung unter{" "}
          <a
            href="https://www.fints.org/de/hersteller/produktregistrierung"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            fints.org
          </a>
          .
        </p>
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="z. B. 7FD7RCC1CP14CE8B35C59DD07"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {message && (
        <p
          className={
            message.type === "error"
              ? "text-sm text-destructive"
              : "text-sm text-emerald-600"
          }
        >
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={saving || !value.trim()}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary ring-offset-background transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {saving ? "Wird gespeichert…" : "Speichern"}
        </Button>
        <Button
          type="button"
          onClick={handleClear}
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium ring-offset-background transition-colors hover:bg-accent"
        >
          Zurücksetzen
        </Button>
      </div>
    </form>
  );
}
