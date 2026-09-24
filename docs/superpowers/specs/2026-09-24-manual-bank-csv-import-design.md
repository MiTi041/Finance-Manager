# Manueller Bank-CSV-Import — Design

## Ziel

Manuelle Bankkonten (`bank_key == "manual"`) können CSV-Dateien nach einem festen,
zentral definierten Schema importieren. Die CSV-Spalten werden auf die manuellen
`umsaetze`-Spalten gemappt. Erste Formate: C24 und ein generisches Fallback.

## Nicht-Ziele

- Kein automatisches Anlegen von Kategorien.
- Keine bankspezifische Sonderlogik (nur deklaratives Mapping).
- Kein Server-Session-State (Vorschau liegt clientseitig).
- Kein Import für FinTS-Banken (die syncen remote).

## Schema-Registry

Zentral in `backend/finance_server/services/csv_import_service.py` als `SCHEMAS`-Dict.
Neue Bank = ein Eintrag mit `label`, `delimiter`, `encodings`, `date_formats`,
`columns` (manuelles Feld → Liste möglicher CSV-Header, erster Treffer gewinnt).

C24-Mapping (realer Export: Komma-Delimiter, UTF-8, Betrag `0,01 €`):

| C24-Spalte | manuelles Feld |
|---|---|
| Buchungsdatum | `date` (+ `entry_date`) |
| Betrag | `amount` (Komma → Punkt, signiert) |
| Zahlungsempfänger | `recipient_name` |
| IBAN | `applicant_iban` |
| Verwendungszweck | `purpose` |
| Kategorie + Unterkategorie | `kategorie` (Name-Match, sonst null; Unterkategorie zuerst) |
| Beschreibung | `note` |
| Transaktionstyp, Karteneinsatz, BIC, Kontonummer, Kontoname, Bargeldabhebung | ignoriert |

Da der Betrag ein Komma enthält und nicht immer gequotet ist, werden deutsche
Beträge mit `€` vor dem CSV-Parsing in Anführungszeichen gesetzt
(`normalize_amount_fields`), damit das Dezimalkomma die Spalten nicht verschiebt.
Leere Zeilen werden übersprungen.

Generisches Schema: Spaltennamen entsprechen den manuellen Feldern (plus gängige
deutsche Aliase), Delimiter `,`.

## Parsing

Decode (utf-8-sig, Fallback cp1252) → Delimiter-Sniff (Fallback aus Schema) →
Header-Mapping normalisiert → Datum via `date_formats` → Betrag (Währungszeichen/
Tausender/Komma) → Kategorie per Name-Match über `list_categories()` (bei
"Kategorie/Unterkategorie" werden auch die Segmente einzeln versucht) →
Validierung (Datum/Betrag fehlend oder 0 = ungültig).

## Dedupe

Deterministische `transaction_id`:
`manual-csv-<sha1(account_iban|date|amount|recipient_name|purpose)>`. Dadurch ist der
bestehende `transaction_hash` stabil und `insert_transactions` überspringt Re-Importe.
Die Vorschau markiert Zeilen als `duplicate`, wenn der Hash bereits existiert
(`existing_transaction_hashes`).

## API

- `GET /api/db/transactions/csv-schemas` → Formatliste.
- `POST /api/db/transactions/csv-preview` (Multipart: Datei + `schema_key` + `account_iban`)
  → normalisierte Zeilen + Zähler (ok/duplicate/invalid).
- `POST /api/db/transactions/csv-import` (JSON: `account_iban` + Zeilen) → `{received, inserted, ignored}`.
- Import validiert, dass das Konto manuell ist (`MANUAL_ACCOUNT_REQUIRED`).

## Frontend

Dialog (`csv-import-dialog.tsx`) mit Format-Auswahl, Datei-Upload, Vorschautabelle
inkl. Status-Badges, Import-Button. Gestartet per Toolbar-Button „CSV importieren"
auf der Transaktionsseite, nur bei manuellem Konto (`selectedBank?.manual`).
Nach Import Refresh.

## Bekannte Grenzen

- Beträge ohne Dezimaltrenner (z.B. `1.234`) sind mehrdeutig.
- Der Import vertraut den clientseitig normalisierten Zeilen (lokale App).
- C24-Format (Delimiter/Encoding/Datums-/Betragsformat) ist initial angenommen;
  bei echtem Export ggf. nur der `SCHEMAS`-Eintrag anzupassen.
