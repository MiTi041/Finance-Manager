# Design: can_transfer Banner im Bankzugang

Datum: 2026-08-03

## Ziel

In den Einstellungen unter "Bankzugang" zeigt jede verbundene Bank-Karte an, ob
für diese Bank Überweisungen aktiviert sind (`can_transfer` aus der hardcodierten
Bank-Config).

## Kontext

- `can_transfer` ist pro Bank hardcodiert in `backend/finance_server/fints/banks.py`
  (`BankDefinition.can_transfer`).
- Das Frontend bekommt es bereits über `GET /bank-credentials/banks` →
  `fetchAvailableBanks()` (Typ `BankDefinition.can_transfer`).
- `BankAccessTab` lädt `availableBanks` bereits und hat Zugriff auf das Flag.
- Die Anzeige-Komponente `Banks` (`frontend/src/pages/settings/tabs/bank/banks.tsx`)
  kennt `can_transfer` noch nicht.

## Änderungen (nur Frontend)

1. **`banks.tsx`**: Neue Prop `canTransferByBankKey: Map<string, boolean>`.
   Im Bank-Header neben dem "Aktiv"-Badge wird ein Badge gerendert:
   - `can_transfer === true` → grün "Überweisungen aktiv"
   - `can_transfer === false` → neutral "Überweisungen nicht unterstützt"
   - unbekannte Bank → kein Badge (keine Annahme treffen)

2. **`bank-access-tab.tsx`**: Aus `availableBanks` eine Map
   `bank_key → can_transfer` bauen und an `<Banks>` übergeben.

## Bewusst nicht

- Kein Backend-Change, kein neues Storage-Feld (Flag ist statisch pro Bank).
- Kein Pro-Konto-Banner: `can_transfer` ist pro Bank definiert, daher eine
  Angabe pro Bank-Karte.
- Kein Toggle/Editing: Wert ist hardcodiert.
