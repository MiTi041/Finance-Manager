import {
  CheckIcon,
  FileText,
  Filter,
  FilterX,
  Gauge,
  Keyboard,
  MousePointerClick,
  SearchIcon,
  Sparkles,
  Tags,
} from "lucide-react";

import { type Slide } from "@/components/tutorial-overlay";

export const transactionTutorialStorageKey = "finance.tutorial.transactions.v2";

export const transactionTutorialSlides: Slide[] = [
  {
    icon: <Gauge className="size-10 text-violet-500" />,
    title: "Willkommen bei Finance",
    description: (
      <div className="space-y-3">
        <p>
          Diese Anwendung hilft dir, deine Bank-Transaktionen zu verwalten und zu kategorisieren. Du
          siehst alle deine Ein- und Ausgaben auf einen Blick und kannst sie übersichtlich ordnen.
        </p>
        <p>In den nächsten Schritten zeigen wir dir die wichtigsten Funktionen.</p>
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
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
        <path d="M8 11h6" />
        <path d="M11 8v6" />
      </svg>
    ),
    title: "Suchen & Sortieren",
    description: (
      <div className="space-y-3">
        <p>
          Oben in der Liste findest du die <strong>Suchleiste</strong>. Gib einfach einen Begriff
          ein – die Liste filtert sofort nach Zahlungspartner, Verwendungszweck, IBAN, Datum und
          mehr.
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <SearchIcon className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Durchsucht alle Felder: <strong>Name, Verwendungszweck, IBAN,</strong>{" "}
            <strong>Anmerkung, Buchungstext</strong>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            className="size-5 shrink-0 text-violet-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 16 4 4 4-4" />
            <path d="M7 20V4" />
            <path d="m21 8-4-4-4 4" />
            <path d="M17 4v16" />
          </svg>
          <span className="text-sm">
            Klicke auf <strong>Datum</strong>, <strong>Betrag</strong> oder{" "}
            <strong>Empfänger</strong>, um die Liste zu sortieren
          </span>
        </div>
        <div className="rounded-lg border bg-muted/50 px-4 py-3">
          <p className="text-sm">
            Mit dem <strong>Datumsfilter</strong> oben auf der Seite wählst du einen Zeitraum
            (z.&nbsp;B. "Letzte 30 Tage" oder selbst gewählter Bereich).
          </p>
        </div>
      </div>
    ),
  },
  {
    icon: (
      <div className="flex items-center gap-1">
        <Filter className="size-9 text-violet-500" />
      </div>
    ),
    title: "Filtern & Auswählen",
    description: (
      <div className="space-y-3">
        <p>
          Unter der Suche findest du mächtige Filter, um dich auf das Wesentliche zu konzentrieren:
        </p>
        <div className="space-y-2 rounded-lg border bg-muted/50 px-4 py-3">
          {[
            {
              label: "Nur Unkategorisierte",
              desc: "Zeigt nur Transaktionen ohne Kategorie",
            },
            {
              label: "Unbekannte IBAN",
              desc: "Transaktionen ohne verknüpften Zahlungspartner",
            },
            {
              label: "Einnahmen / Ausgaben",
              desc: "Nur Zu- oder Abflüsse anzeigen",
            },
            {
              label: "Kategorie-Filter",
              desc: "Auf eine bestimmte Kategorie einschränken",
            },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-start gap-3 text-sm">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-violet-500" />
              <div>
                <strong>{label}</strong>
                <span className="text-muted-foreground"> – {desc}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-sm">
            Mit den <strong>Checkboxen</strong> links wählst du mehrere Transaktionen aus und kannst
            sie alle auf einmal kategorisieren oder löschen.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            className="size-5 shrink-0 text-violet-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          <span className="text-sm">
            Über <strong>"CSV exportieren"</strong> unten in der Liste exportierst du alle
            gefilterten Transaktionen als Datei.
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: <FileText className="size-10 text-violet-500" />,
    title: "Transaktion öffnen",
    description: (
      <div className="space-y-3">
        <p>
          Klicke auf eine Transaktion, um sie aufzuklappen. Dann siehst du alle Details auf einen
          Blick:
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <MousePointerClick className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            <strong>Klick</strong> auf eine Zeile, um sie aufzuklappen
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-xs">
          <div className="space-y-1">
            <p className="font-medium">Spalte 1</p>
            <p className="text-muted-foreground">
              Zahlungspartner mit IBAN, BIC, verknüpftem Konto
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Spalte 2</p>
            <p className="text-muted-foreground">Verwendungszweck, Buchungstext, Wertstellung</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Spalte 3</p>
            <p className="text-muted-foreground">Kategorie, KI-Vorschlag, Splits</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <Keyboard className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Mit{" "}
            <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium">
              ↑
            </kbd>{" "}
            <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium">
              ↓
            </kbd>{" "}
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
    title: "Kategorie vergeben",
    description: (
      <div className="space-y-3">
        <p>
          Jede Transaktion bekommt eine Kategorie – z.&nbsp;B. "Lebensmittel", "Miete" oder
          "Gehalt". So behältst du den Überblick über deine Finanzen.
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <MousePointerClick className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Klicke auf das orangefarbene Feld, um die Kategorie-Auswahl zu öffnen
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <Keyboard className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium">
              Enter
            </kbd>{" "}
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
          Die KI schlägt automatisch eine Kategorie vor, sobald du eine Transaktion öffnest. Der
          Vorschlag erscheint in einer violetten Karte.
        </p>
        <div className="flex items-center gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3">
          <Sparkles className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Die <strong>Konfidenz</strong> (0–100%) zeigt, wie sicher die KI ist. Je höher, desto
            zuverlässiger.
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <Keyboard className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Drücke{" "}
            <kbd className="rounded border border-current/30 px-1.5 py-0.5 text-xs font-medium">
              G
            </kbd>
            , um den Vorschlag zu übernehmen
          </span>
        </div>
        <div className="rounded-lg border bg-muted/50 px-4 py-3">
          <p className="text-sm">
            <strong>Die KI lernt mit:</strong> Mit jeder Kategorisierung werden die Vorschläge
            besser. Häufige Transaktionen erkennt sie schnell, bei seltenen ist die Konfidenz
            niedriger.
          </p>
        </div>
      </div>
    ),
  },
  {
    icon: (
      <div className="flex items-center gap-1">
        <Tags className="size-5 text-violet-500" />
        <svg
          viewBox="0 0 24 24"
          className="size-5 text-violet-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 12h-8" />
          <path d="M14 6v12" />
          <path d="M3 12h6" />
          <path d="M9 8v8" />
          <path d="M18 8.5V15" />
        </svg>
      </div>
    ),
    title: "Notizen, Tags & Splits",
    description: (
      <div className="space-y-3">
        <p>
          In der geöffneten Transaktion kannst du <strong>Notizen</strong> hinzufügen – z.&nbsp;B.
          für nützliche Infos oder Merkhinweise.
        </p>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <Tags className="size-5 shrink-0 text-violet-500" />
          <span className="text-sm">
            Schreibe <strong>#hashtags</strong> in die Notiz – sie werden automatisch als violette
            Tags angezeigt
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-amber-500/5 border-amber-500/20 px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            className="size-5 shrink-0 text-violet-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 12h-8" />
            <path d="M14 6v12" />
            <path d="M3 12h6" />
            <path d="M9 8v8" />
            <path d="M18 8.5V15" />
          </svg>
          <span className="text-sm">
            Mit <strong>Splits</strong> kannst du eine Transaktion auf mehrere Kategorien aufteilen
            (z.&nbsp;B. ein Einkauf mit Lebensmitteln + Drogerie)
          </span>
        </div>
      </div>
    ),
  },
];
