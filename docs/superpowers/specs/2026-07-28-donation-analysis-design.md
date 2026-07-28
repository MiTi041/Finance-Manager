# Spenden-Analyse (Donation Analysis)

## Ziel
Auf der Spenden-Bucket-Card einen Analyse-Button, der ein Dialog mit Aufschlüsselung nach Spendenkonto öffnet: wie viel an welches Konto gespendet wurde, mit BankLogo. Ungematchte → "Andere".

## Ansatz: Transaction-Matching

### Backend: `GET /allocation/donation-analytics`
- Query `umsaetze` für ausgehende Transaktionen (amount < 0) mit `purpose LIKE '%tag.spenden%'`
  oder IBAN matched ein donation-account
- Matche per IBAN/recipient_name auf `empfaengerkonten WHERE is_donation_account = 1`
- Lade Logo via `get_zahlungspartner_by_iban()`
- Gruppiere pro Konto: `{ account_name, recipient_name, iban, total, count, logo_url? }`
- Ungematchte → `{ name: "Andere", total, count }`
- Inkludiere Gesamtsumme

### Frontend: DonationAnalysisDialog
- "Analyse" Button auf der Donation-Bucket-Card (neben Settings)
- shadcn Dialog
- Pro Konto: Zeile mit BankLogo, Name, Betrag, Prozent
- "Andere"-Eintrag falls nötig
- Gesamtsumme unten

### Keine DB-Migration
Alles aus existierenden Daten gematcht.

## Dateien
- **Backend**: `api/allocation.py` (neuer Endpoint), `services/allocation_service.py` (neue Methode)
- **Frontend**: `components/donation-analysis-dialog.tsx` (neuer Dialog), `pages/allocation/components/bucket-card.tsx` (Analyse-Button), `pages/allocation/allocation-page.tsx` (Integration)