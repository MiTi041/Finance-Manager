import { useEffect, useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { handleMailRegistration } from "../lib/mail";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8112/api";

export function ProductIdSetup({ onComplete }: { onComplete: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pid = value.trim();
    if (!pid) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/product-id`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: pid }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      window.localStorage.setItem(PRODUCT_ID_CACHE_KEY, "true");
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbindungsfehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col items-center gap-6 text-center"
      >
        <h1 className="text-2xl font-bold">FinTS-Produkt-ID</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Um Bankdaten per FinTS (HBCI) abrufen zu können, benötigt diese Anwendung eine persönliche
          Produkt-ID.
          <br />
          <br />
          Registriere deine Anwendung kostenfrei unter{" "}
          <a
            href="https://www.fints.org/de/hersteller/produktregistrierung"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            fints.org
          </a>{" "}
          und trage die erhaltene ID unten ein. Die erteilung der Produkt-ID kann bis zu 2 Wochen
          dauern.
        </p>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="z. B. 7FD7RCC1CP14CE8B35C59DD07"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={saving || !value.trim()}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-accent ring-offset-background transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {saving ? "Wird gespeichert…" : "Speichern"}
        </Button>
        <Button
          type="button"
          onClick={() => handleMailRegistration()}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background text-foreground px-6 text-sm font-medium ring-offset-background transition-colors hover:bg-accent"
        >
          Registrierungsformular per E-Mail
        </Button>
      </form>
    </div>
  );
}

const PRODUCT_ID_CACHE_KEY = "finance.product-id.configured";

export function hasProductId(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PRODUCT_ID_CACHE_KEY) === "true";
}
