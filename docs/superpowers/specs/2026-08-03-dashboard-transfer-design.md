# Dashboard-Transfer Design

**Datum:** 2026-08-03

## Ziel

Von der Gesamtvermögen-Karte im Dashboard aus eine direkte SEPA-Überweisung auslösen:
Empfänger → Verwendungszweck → Betrag (Slider 0–Kontostand) → „Ja, bezahlen" →
Bestätigungsdialog → fertig. Nur für Konten mit `can_transfer=true` („Transfer aktiv").

## Ansatz

- **Backend:** 0 Änderungen. `POST /api/transfer` existiert bereits
  (`backend/finance_server/api/fints/transfer.py:14`, nimmt `TransferRequest`).
- **Frontend:** Neuer Setup-Dialog + Button auf der Karte. Betrag via bestehendem
  `PayoutSlider` (0–Kontostand, Presets 25/50/75/100 %), Bestätigung via bestehendem
  `TransferDialog` (inkl. TAN-Handling).

## Ablauf

1. Button „Überweisen" auf der Gesamtvermögen-Karte — nur sichtbar, wenn ≥1
   Transfer-aktives Konto existiert (`/bank-credentials/banks` → `can_transfer`).
2. Setup-Dialog:
   - **Absender**-Dropdown (nur Transfer-aktive Konten, Balance sichtbar; vorbelegt mit
     aktivem Konto bzw. erstem Konto)
   - **Empfänger**: SearchableSelect (gespeicherte Empfängerkonten + eigene Konten +
     „Manuelle Eingabe"). Bei manueller Eingabe Name/IBAN/BIC + Checkbox
     „Als Empfängerkonto speichern" (legt via `createRecipientAccount` an).
   - **Verwendungszweck**: freies Textfeld (optional; Fallback `"Überweisung"` im Request)
   - **Betrag**: PayoutSlider 0 bis Kontostand des gewählten Absenders
   - „Ja, bezahlen" → validiert, schließt Setup, öffnet Bestätigung
3. TransferDialog (bestehend): Zusammenfassung + TAN + „Abschicken" →
   `executeDirectTransfer()`.
4. Erfolg: Toast + `triggerRefresh()` (Salden aktualisieren).

## Validierung

- Empfänger Name + IBAN Pflicht; IBAN mod-97-Checksumme (`isValidIban` in
  `frontend/src/lib/transfer-utils.ts`).
- Betrag > 0 und ≤ Kontostand des Absenders; Kontostand ≤ 0 → Slider-Hinweis, kein Submit.
- TAN-Fehler (409 `TAN_REQUIRED`) → `TanRequiredError` aus `@/lib/allocation` (TransferDialog
  erkennt ihn per `instanceof`).

## Dateien

| Datei | Aktion |
|---|---|
| `frontend/src/lib/transfer-utils.ts` | NEU — `isValidIban`, `buildTransferRequestBody`, `DirectTransferPayload` (dependency-frei, testbar) |
| `frontend/src/lib/direct-transfer.test.ts` | NEU — node:assert-Tests |
| `frontend/src/lib/direct-transfer.ts` | NEU — `executeDirectTransfer()` (POST `/transfer`) |
| `frontend/src/pages/dashboard/components/transfer-setup-dialog.tsx` | NEU — Setup-Dialog |
| `frontend/src/pages/dashboard/components/stat-card.tsx` | `action`-Prop (ReactNode) im Karten-Header |
| `frontend/src/pages/dashboard/dashboard-page.tsx` | Button, Dialog-State, Verkabelung |
| `frontend/src/hooks/use-finance-data.ts` | gibt `linkedBanks` zusätzlich zurück (IBAN→bankKey) |

## Bewusst weggelassen

- DB-Erfassung der Überweisung (kommt per Bank-Sync als Transaktion).
- Instant-Payment-Umschaltung, Empfänger-Logo im Dialog.
- Manuelle Prüfung im Browser (Playwright-Browser nicht installierbar): ersetzt durch
  Build, ESLint, Unit-Test und Backend-Vertragstest.
