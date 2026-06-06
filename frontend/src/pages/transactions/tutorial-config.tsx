import { FileText, Gauge, Keyboard, Lightbulb, MousePointerClick, Sparkles } from "lucide-react";

import { type Slide } from "@/components/tutorial-overlay";

export const transactionTutorialStorageKey = "finance.tutorial.transactions.v1";

export const transactionTutorialSlides: Slide[] = [
  {
    icon: <Gauge className="size-10 text-violet-500" />,
    title: "Willkommen bei Finance",
    description: (
      <div className="space-y-3">
        <p>
          Diese Anwendung hilft dir, deine Bank-Transaktionen zu verwalten und zu
          kategorisieren. Du siehst alle deine Ein- und Ausgaben auf einen Blick
          und kannst sie übersichtlich ordnen.
        </p>
        <p>
          In den nächsten Schritten zeigen wir dir, wie du Transaktionen
          kategorisierst und die KI dir dabei hilft.
        </p>
      </div>
    ),
  },
  {
    icon: <FileText className="size-10 text-violet-500" />,
    title: "Transaktionen erkunden",
    description: (
      <div className="space-y-3">
        <p>
          Klicke auf eine Transaktion, um sie zu öffnen. Dann siehst du alle
          Details: Zahlungspartner, Verwendungszweck und die Kategorie.
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <MousePointerClick className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            <strong>Klick</strong> auf eine Zeile, um sie aufzuklappen
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <Keyboard className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Mit <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium">↑</kbd>{" "}
            <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium">↓</kbd>{" "}
            springst du zwischen unkategorisierten Transaktionen
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-10 text-violet-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7V4h16v3" />
        <path d="M9 20h6" />
        <path d="M12 4v16" />
      </svg>
    ),
    title: "Kategorie auswählen",
    description: (
      <div className="space-y-3">
        <p>
          Jede Transaktion bekommt eine Kategorie – z.&nbsp;B. "Lebensmittel",
          "Miete" oder "Gehalt". So behältst du den Überblick über deine
          Finanzen.
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <MousePointerClick className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Klicke auf das orangefarbene Feld, um die Kategorie-Auswahl zu
            öffnen
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <Keyboard className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium">Enter</kbd>{" "}
            öffnet die Auswahl, wenn das Kategorie-Feld fokussiert ist
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Du kannst nach Kategorien suchen – einfach anfangen zu tippen.
        </p>
      </div>
    ),
  },
  {
    icon: <Sparkles className="size-10 text-violet-500" />,
    title: "KI-Vorschläge nutzen",
    description: (
      <div className="space-y-3">
        <p>
          Die KI schlägt automatisch eine Kategorie vor, sobald du eine
          Transaktion öffnest. Der Vorschlag erscheint in einer violetten Karte.
        </p>
        <div className="flex items-center gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3">
          <Sparkles className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Die <strong>Konfidenz</strong> (0–100%) zeigt, wie sicher die KI
            ist. Je höher, desto zuverlässiger.
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <Keyboard className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Drücke <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium">G</kbd>, um
            den Vorschlag zu übernehmen
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: <Lightbulb className="size-10 text-violet-500" />,
    title: "Die KI lernt mit",
    description: (
      <div className="space-y-3">
        <p>
          Die KI merkt sich, welche Kategorien du vergeben hast. Mit jeder
          Transaktion, die du kategorisierst, wird sie besser.
        </p>
        <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 px-4 py-3">
          <p className="text-sm">
            <strong>Häufige Transaktionen</strong> (z.&nbsp;B. wöchentlicher
            Einkauf) erkennt die KI schnell und schlägt die richtige Kategorie
            mit hoher Sicherheit vor.
          </p>
        </div>
        <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 px-4 py-3">
          <p className="text-sm">
            <strong>Seltene Transaktionen</strong> (z.&nbsp;B. einmalige
            Überweisungen) haben oft eine niedrige Konfidenz. Das ist normal –
            hier musst du die Kategorie selbst wählen.
          </p>
        </div>
      </div>
    ),
  },
  {
    icon: <Keyboard className="size-10 text-violet-500" />,
    title: "Das Wichtigste auf einen Blick",
    description: (
      <div className="space-y-4">
        <p>Hier sind alle Tastenkürzel zusammengefasst:</p>
        <div className="space-y-2 rounded-lg border bg-muted/50 px-4 py-3">
          {[
            { keys: ["↑", "↓"], desc: "Zwischen unkategorisierten Transaktionen springen" },
            { keys: ["Enter"], desc: "Kategorie-Auswahl öffnen" },
            { keys: ["G"], desc: "KI-Vorschlag übernehmen" },
            { keys: ["Esc"], desc: "Transaktion schließen" },
          ].map(({ keys, desc }) => (
            <div key={desc} className="flex items-center gap-3 text-sm">
              <div className="flex shrink-0 gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Du kannst dieses Tutorial jederzeit über die <strong>Anleitung</strong> Taste oben in der Leiste öffnen.
        </p>
      </div>
    ),
  },
];
