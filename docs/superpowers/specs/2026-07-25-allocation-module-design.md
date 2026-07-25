# Allocation-Modul — Design

## 1. Überblick

Das Allocation-Modul bringt Finance die Einkommens-Allokation aus FinancePlan,
aber sauber modularisiert (kein One-Pager). Es ergänzt die bestehende App um:

- **5 Buckets**: Bafög-Rücklage, Notgroschen, Investieren, Spenden,
  Restliche Ausgaben (Info-Only)
- **Monatliche Allokation**: Prozentuale Verteilung des Netto-Einkommens
- **Ausführung**: SEPA-Überweisung pro Bucket ans konfigurierte Empfängerkonto
- **Settings**: Bucket-Prozente, Empfängerkonten, Bafög-Toggle

## 2. Architektur (Backend)

Neue Dateien nach bestehendem Muster (`Service → DB → Router`):

```
backend/finance_server/
├── db/
│   └── allocation.py          # SQL-Zugriff (CRUD buckets, runs, history)
├── services/
│   └── allocation_service.py  # Geschäftslogik (Berechnung, Ausführung)
├── api/
│   └── allocation.py          # FastAPI-Router
└── models/
    └── allocation.py          # Pydantic-Modelle
```

### 2.1 Neue Tabellen

```sql
CREATE TABLE IF NOT EXISTS allocation_buckets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_type TEXT NOT NULL CHECK(bucket_type IN (
        'bafoeg', 'emergency', 'invest', 'donation', 'spending'
    )),
    -- Nutzer ist eindeutig identifiziert — bei Single-User reicht eine Zeile pro Typ
    percentage  REAL NOT NULL DEFAULT 0 CHECK(percentage >= 0 AND percentage <= 100),
    -- Empfängerkonto für SEPA-Überweisung (FK zu empfaengerkonten)
    recipient_account_id INTEGER,
    -- IBAN des Absenderkontos (leer = default aus der aktiven Bankauswahl)
    sender_iban TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_account_id) REFERENCES empfaengerkonten(id) ON DELETE SET NULL,
    UNIQUE(bucket_type)
);

-- Für Bafög: Extra-Tabelle mit den persönlichen Daten
CREATE TABLE IF NOT EXISTS allocation_bafoeg_config (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    total_debt      REAL NOT NULL DEFAULT 7600,
    monthly_rate    REAL NOT NULL DEFAULT 267,
    interest_rate   REAL NOT NULL DEFAULT 2.0,
    payout_date     TEXT,  -- ISO-Datum der Auszahlung (z.B. "2027-08-01")
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Monatliche Allokations-Läufe
CREATE TABLE IF NOT EXISTS allocation_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    month           TEXT NOT NULL,  -- "2026-07"
    net_income      REAL NOT NULL,
    total_allocated REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'calculated' CHECK(status IN ('calculated', 'partial', 'completed')),
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Pro-Bucket-Status eines Runs
CREATE TABLE IF NOT EXISTS allocation_run_buckets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          INTEGER NOT NULL,
    bucket_id       INTEGER NOT NULL,
    target_amount   REAL NOT NULL,
    transferred     REAL NOT NULL DEFAULT 0,
    transferred_at  TEXT,
    is_completed    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (run_id) REFERENCES allocation_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (bucket_id) REFERENCES allocation_buckets(id) ON DELETE CASCADE
);
```

### 2.2 API-Endpunkte

| Methode | Pfad | Beschreibung |
|--------|------|-------------|
| `GET` | `/api/allocation/status` | Aktueller Monat: Netto-Einkommen, Buckets, Ist-Werte |
| `GET` | `/api/allocation/buckets` | Alle Buckets mit Konfiguration |
| `PUT` | `/api/allocation/buckets/{id}` | Bucket-Prozentsatz/Empfängerkonto ändern |
| `GET` | `/api/allocation/bafoeg-config` | Bafög-Konfiguration (nur wenn aktiv) |
| `PUT` | `/api/allocation/bafoeg-config` | Bafög-Konfiguration aktualisieren |
| `PATCH` | `/api/allocation/settings` | Bafög-Toggle (`bafoeg_enabled: bool`) in app_settings |
| `POST` | `/api/allocation/run` | Allokation für aktuellen Monat neu berechnen |
| `POST` | `/api/allocation/transfer/{run_bucket_id}` | SEPA-Überweisung für einen Bucket ausführen |
| `GET` | `/api/allocation/history` | Historie vergangener Runs |

### 2.3 Datenfluss

1. **Einkommen ermitteln**: Service sucht in `umsaetze` nach
   positiven Buchungen (>0) im aktuellen Monat, die als Gehalt
   klassifiziert sind (Kategorie-ID aus Config, z.B. "Gehalt").
   Falls keine Kategorie gesetzt ist: Bestimmte Verwendungszweck-Muster
   wie "Gehalt", "Lohn", "Auszahlung". Der Nutzer kann in den Settings
   die Kategorie für Einkommen manuell setzen.
2. **Allokation berechnen**: Jeder Bucket bekommt `Netto × percentage / 100`.
   Die Summe aller Prozente muss ≤ 100 sein. Der Spending-Bucket
   bekommt den Rest (`100 - Summe(aktive Buckets)`), sodass immer
   genau 100% alloziert werden. Bafög hat keinen Sonderstatus in der
   Berechnung — nur in der Anzeige (Restschuld, Zinsen).
3. **Speichern**: `allocation_runs` + `allocation_run_buckets` mit
   Soll-Werten.
4. **Ausführen**: Nutzer klickt "Jetzt zahlen" → POST an
   `allocation/transfer/{id}` → ruft bestehende `POST /api/transfer`
   auf (FinTS-SEPA).
5. **Verfolgen**: Nach erfolgreicher Überweisung wird
   `transferred` + `transferred_at` in `allocation_run_buckets`
   gespeichert.

## 3. Frontend

Neue Dateien:

```
frontend/src/
├── pages/
│   └── allocation/
│       ├── allocation-page.tsx          # Hauptseite
│       ├── components/
│       │   ├── allocation-summary.tsx    # Zusammenfassung oben
│       │   ├── bucket-card.tsx           # Ein Bucket (Progress, Button)
│       │   ├── bafoeg-card.tsx           # Bafög-spezifisch (aktiv/inaktiv)
│       │   └── transfer-dialog.tsx       # "Jetzt zahlen" Dialog
│       └── hooks/
│           └── use-allocation.ts         # Daten-Fetch-Hook
├── pages/settings/
│   └── tabs/
│       └── allocation/
│           ├── allocation-settings-tab.tsx  # Tab in Settings
│           ├── bucket-form.tsx              # Prozent/Empfängerkonto bearbeiten
│           └── bafoeg-config-form.tsx       # Bafög-Daten (nur wenn aktiv)
```

### 3.1 Routing

- Neue Nav-Einträge: "Finanzplan" (mit Icon `PiggyBank` oder `Wallet`)
- Route: `/finance-plan`
- Settings: neuer Tab "Allokation" in der Settings-Seite

### 3.2 Seite "Finanzplan"

- **Header**: Aktueller Monat, Netto-Einkommen (automatisch ermittelt),
  Gesamt-Allokations-Status
- **Bucket-Cards**: Progress-Bar, Zielbetrag, "Jetzt zahlen"-Button
  (falls Soll noch nicht erreicht)
- **Bafög-Spezial**: Zeigt Zins, Restschuld, Prognose. Nur sichtbar
  wenn in Settings aktiviert. Wenn deaktiviert — komplett ausgeblendet.
- **Spending-Bucket**: Nur Info (kein Transfer-Button)

### 3.3 Transfer-Dialog

- Modal mit: Betrag, Empfänger, IBAN, Verwendungszweck
- TAN-Eingabe (falls erforderlich) — wiederverwendet die bestehende
  TAN-Handling-Logik
- Status-Animation während der Ausführung
- Erfolgs-/Fehleranzeige

### 3.4 Settings-Tab "Allokation"

- Toggle: "Bafög-Modus aktivieren" (nur für Admin-Nutzer sichtbar)
- Prozentsätze pro Bucket (Slider oder Number-Input)
  - Validierung: Summe ≤ 100%
  - Bafög-Prozentsatz: wird aus `monthly_rate / net_income` berechnet oder manuell
- Empfängerkonto pro Bucket (Dropdown aus `empfaengerkonten`)
- Absenderkonto pro Bucket (Dropdown aus den verfügbaren Bankkonten/IBANs)
- Bafög-Konfiguration: Gesamtschuld, Rate, Zins, Auszahlungsdatum
  (nur angezeigt wenn Bafög aktiv)

## 4. Bafög-Behandlung

Das Bafög-Feature ist ein **persönlicher Block** des Entwicklers.
Lösung:

1. In der DB existiert `allocation_buckets` mit `bucket_type = 'bafoeg'`
   — aber sie wird nur angelegt/angezeigt wenn `app_settings.bafoeg_enabled = true`.
2. In den Settings gibt es den Toggle "Bafög-Modus aktivieren".
   Standard: `false`.
3. Wenn deaktiviert: Der Bafög-Eintrag in `allocation_buckets` wird
   auf `is_active = false` gesetzt. Die restlichen aktiven Buckets
   skalieren ihre Prozentsätze proportional hoch, sodass die Summe
   100% ergibt. Z.B. bei 30/30/10/30 (Invest/Emergency/Donation/Spending)
   wird jeder * (100 / 100) = gleicher Wert — da kein Bafög-Anteil
   umverteilt wird, bleiben die Prozente wie konfiguriert und der
   Nutzer muss sie ggf. anpassen. Ein UI-Hinweis zeigt den
   Neuberechnungsbedarf an.
4. Das Frontend rendert die Bafög-Card nur wenn aktiv.

Perspektivisch könnte man das auch per Environment-Variable oder
Feature-Flag machen, aber der Settings-Toggle ist für den persönlichen
Gebrauch ausreichend und vermeidet Komplexität.

## 5. Erweiterung: Sparpläne

Sparpläne sind separate benutzerdefinierte Buckets (zusätzlich zu den 5
festen):

```sql
CREATE TABLE IF NOT EXISTS allocation_savings_goals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    target_amount   REAL NOT NULL,
    target_date     TEXT,           -- optional: YYYY-MM
    recipient_account_id INTEGER,
    monthly_amount  REAL,           -- null = auto aus Rest
    tag             TEXT UNIQUE,    -- z.B. "urlaub-2027"
    is_active       INTEGER NOT NULL DEFAULT 1,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_account_id) REFERENCES empfaengerkonten(id) ON DELETE SET NULL
);
```

Wird später ergänzt, nicht im ersten Release.

## 6. Was NICHT implementiert wird (YAGNI)

- TimesFM-Balance-Forecast (Finance hat kein ML-Setup)
- Vermögenssimulation bis 2084
- CatBoost-Kategorievorhersage (Finance hat TF-IDF)
- Bafög-Rechner-Tool
- Sankey-Diagramme

## 7. Abhängigkeiten zum bestehenden System

| Abhängigkeit | Nutzung |
|-------------|---------|
| `empfaengerkonten` | Empfängerkonfiguration pro Bucket |
| `POST /api/transfer` | SEPA-Ausführung |
| `app_settings` | Bafög-Toggle, Feature-Flags |
| `umsaetze` | Einkommensermittlung |
| `get_connection()` aus `core/database.py` | DB-Zugriff |
| ErrorBoundary, lazy-loading | Frontend-Patterns |
| Event-System (`finance-data-refresh`) | Refresh nach Transfer |

## 8. Teststrategie

- Backend: Unit-Tests für `AllocationService.calculate()` mit gemocktem
  DB-Layer und festen Einkommenswerten
- Frontend: Manuelle Verifikation (das Projekt hat kein Test-Framework
  für Frontend)

## 9. Implementierungs-Reihenfolge

1. DB-Schema & Migration (`schema.py`)
2. Backend: DB-Modul (`db/allocation.py`)
3. Backend: Pydantic-Modelle (`models/allocation.py`)
4. Backend: Service (`services/allocation_service.py`)
5. Backend: Router (`api/allocation.py`)
6. Frontend: Hooks (`hooks/use-allocation.ts`)
7. Frontend: Komponenten (BucketCard, TransferDialog)
8. Frontend: Seite (`allocation-page.tsx`)
9. Frontend: Routing & Nav-Eintrag
10. Frontend: Settings-Tab (Allokation, Bafög-Toggle)
