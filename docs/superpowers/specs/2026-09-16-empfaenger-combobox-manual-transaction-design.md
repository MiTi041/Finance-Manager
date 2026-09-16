# Empfänger-Combobox im Transaktions-Formular — Design

Datum: 2026-09-16
Status: genehmigt

## Ziel

Im Formular "Transaktion hinzufügen" (`ManualTransactionSheet`, nur manuelle
Konten) soll das Feld **Empfänger / Auftraggeber** alternativ aus einer
suchbaren Liste befüllt werden können:

- eigene Konten
- Empfängerkonten
- Zahlungspartner

Freitext-Eingabe bleibt weiterhin möglich.

## Entscheidungen

- **Suchbares Dropdown + Freitext:** Tippen filtert die Vorschläge, man kann
  aber jeden beliebigen Text eingeben.
- **Auswahl übernimmt Name + IBAN** ins jeweilige Feld. Bestehende Werte werden
  überschrieben.
- **Keine Backend-Änderung.** Transaktionen speichern weiterhin Freitext
  (`recipient_name`) und `applicant_iban`; es wird kein FK persistiert.

## Neue Dateien

1. `frontend/src/lib/recipient-options.ts` — reine Logik, kein React:
   - Typ `RecipientOption { id: string; name: string; iban: string; kind: "own" | "recipient" | "partner" }`
   - Typ `RecipientOptionGroup { kind: ...; label: string; options: RecipientOption[] }`
   - `buildRecipientOptions({ ownAccounts, recipientAccounts, zahlungspartner })`
     → `RecipientOptionGroup[]` in Reihenfolge Eigene Konten → Empfängerkonten →
     Zahlungspartner. Leere Gruppen werden weggelassen.
   - `filterRecipientOptions(groups, query)` → gefilterte Gruppen; Treffer bei
     Teilstring in `name` **oder** `iban` (case-insensitive, getrimmt). Leeres
     Query gibt alles zurück. Leere Gruppen werden weggelassen.

   Mapping:
   - eigene Konten (`BankAccountOption`): `name = accountName`, `iban = accountIban`
   - Empfängerkonten (`RecipientAccountRecord`): `name = recipient_name || account_name`, `iban = iban`
   - Zahlungspartner (`ZahlungspartnerRecord`): `name = name`, `iban = ibans[0] ?? ""`

   Dedupe: nach normalisierter IBAN (Whitespace entfernt, Uppercase) über alle
   Gruppen hinweg, Priorität in obiger Reihenfolge (erstes Vorkommen gewinnt).
   Verhindert sichtbare Doppel, z.B. wenn ein eigenes Konto gleichzeitig als
   Zahlungspartner (`is_own_account`) existiert. Einträge ohne IBAN werden
   nicht dedupliziert.

2. `frontend/src/pages/transactions/components/recipient-combobox.tsx` —
   `RecipientCombobox`:
   - Props: `value: string`, `onValueChange: (text: string) => void`,
     `onSelect: (option: RecipientOption) => void`, `groups`, `placeholder?`,
     `emptyText?`, `id?`.
   - Sichtbares `Input` (Freitext) als `PopoverAnchor`; darunter
     `PopoverContent` mit `Command` (`shouldFilter={false}`) + `CommandList`,
     manuell via `filterRecipientOptions` gefiltert. Gruppen als
     `CommandGroup` mit Heading, IBAN als Sekundärtext, leere Gruppen/Listen
     ausblenden. Öffnet bei Fokus/Eingabe, schließt bei Auswahl.

3. `frontend/src/lib/recipient-options.test.ts` — `node:assert` (bestehendes
   Muster), deckt ab: Gruppierung + Reihenfolge, Mapping je Quelle,
   IBAN-Übernahme, Filter über Name und IBAN, Dedupe, Zahlungspartner ohne IBAN.

## Änderungen an bestehenden Dateien

4. `frontend/src/pages/transactions/transactions-page.tsx`:
   - Neuer State `recipientAccounts` + Effekt mit
     `fetchRecipientAccountsReferenceData()` (gecachter Client, kein neuer
     Endpoint). Bei Fehler leerer Array.
   - `ownAccounts`: `linkedAccounts` aus `useFinanceData` ist bereits
     `BankAccountOption[]` (via `buildAccountOptions` in `use-finance-data.ts`)
     und wird direkt durchgereicht.
   - Props an `ManualTransactionSheet`: `ownAccounts`, `recipientAccounts`,
     `zahlungspartner` (State existiert bereits).

5. `frontend/src/pages/transactions/components/manual-transaction-sheet.tsx`:
   - Neue Props `ownAccounts`, `recipientAccounts`, `zahlungspartner`.
   - `groups` via `buildRecipientOptions(...)` (useMemo).
   - Empfänger-`Input` (aktuell Zeile 122–130) durch `<RecipientCombobox>`
     ersetzen. `onSelect` setzt `recipient` = `option.name` und, falls
     `option.iban` nicht leer, `recipientIban` = `option.iban`.
   - Zahlungspartner ohne IBAN: nur Name setzen, IBAN-Feld unangetastet.

## Bewusst weggelassen

- Keine Backend-/Schema-Änderung, keine FK-Zuordnung.
- Kein neuer Endpoint (Empfängerkonten-Referenzdaten sind gecacht vorhanden).
- Kein IBAN-BIC-Autofill aus den Quellen (BIC wird vom Formular nicht erfasst).
- Nachrüsten (Zuordnung per ID statt Freitext) erst, wenn Matching/Reporting
  das braucht.

## Risiken / offene Punkte

- Doppelte IBANs zwischen Quellen → per Dedupe abgefangen.
- Zahlungspartner können mehrere IBANs haben; es wird die erste verwendet.
