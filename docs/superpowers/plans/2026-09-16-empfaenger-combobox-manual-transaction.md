# Empfänger-Combobox im Transaktions-Formular — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Formular "Transaktion hinzufügen" kann das Empfänger-Feld per suchbarem Dropdown aus eigenen Konten, Empfängerkonten und Zahlungspartnern befüllt werden, Freitext bleibt möglich.

**Architecture:** Reine Optionslogik (Gruppieren, Dedupe, Filtern) in einer React-freien Lib-Datei mit Node-Assert-Test. Darauf eine kleine `RecipientCombobox`-Komponente (Radix `Popover` + `cmdk` `Command`). Die Seite reicht eigene Konten, Empfängerkonten und Zahlungspartner als Props an das bestehende Sheet.

**Tech Stack:** React 19 + TypeScript, Vite, Radix UI, cmdk, Tailwind v4, Node 22 (Type-Stripping für Tests), `node:assert`.

## Global Constraints

- Keine Backend-/Schema-Änderung; kein neuer Endpoint.
- Keine neue Dependency.
- Kommentare nur, wo eine bewusste Abweichung erklärt wird.
- Bestehende Muster nutzen: `Popover`/`Command` aus `frontend/src/components/ui/`, Tests als `node:assert`-Skripte wie `frontend/src/lib/direct-transfer.test.ts`.
- Testbare Lib-Module importieren Wert-Abhängigkeiten mit expliziter `.ts`-Endung (nötig für `node --experimental-strip-types`, vgl. `frontend/tsconfig.json` `allowImportingTsExtensions: true`).

---

### Task 1: Optionslogik + Test

**Files:**
- Create: `frontend/src/lib/recipient-options.ts`
- Test: `frontend/src/lib/recipient-options.test.ts`

**Interfaces:**
- Consumes: `normalizeIban(value?: string | null): string` aus `frontend/src/lib/iban.ts`; Typen `BankAccountOption` (`frontend/src/lib/utils/accounts.ts`), `RecipientAccountRecord` (`frontend/src/lib/recipient-accounts.ts`), `ZahlungspartnerRecord` (`frontend/src/lib/zahlungspartner.ts`).
- Produces:
  - `type RecipientOptionKind = "own" | "recipient" | "partner"`
  - `type RecipientOption = { id: string; name: string; iban: string; kind: RecipientOptionKind }`
  - `type RecipientOptionGroup = { kind: RecipientOptionKind; label: string; options: RecipientOption[] }`
  - `buildRecipientOptions(input: { ownAccounts: BankAccountOption[]; recipientAccounts: RecipientAccountRecord[]; zahlungspartner: ZahlungspartnerRecord[] }): RecipientOptionGroup[]`
  - `filterRecipientOptions(groups: RecipientOptionGroup[], query: string): RecipientOptionGroup[]`

- [ ] **Step 1: Failing test schreiben**

Create `frontend/src/lib/recipient-options.test.ts`:

```ts
import { strict as assert } from "node:assert";
import {
  buildRecipientOptions,
  filterRecipientOptions,
} from "./recipient-options.ts";

const groups = buildRecipientOptions({
  ownAccounts: [
    { accountIban: "DE89370400440532013000", accountName: "Giro", bankName: "Bank", scope: "s1" },
    { accountIban: "DE75512108001245126199", accountName: "Tagesgeld", bankName: "Bank", scope: "s2" },
  ],
  recipientAccounts: [
    {
      id: 1,
      account_name: "Miete",
      iban: "DE02120300000000202051",
      recipient_name: "Vermieter GmbH",
      is_donation_account: false,
    },
    {
      id: 2,
      account_name: "Ohne Empfängername",
      iban: "DE44500105175407324931",
      recipient_name: "",
      is_donation_account: false,
    },
  ],
  zahlungspartner: [
    { id: 5, name: "Giro", is_company: false, is_own_account: true, ibans: ["DE89 3704 0044 0532 0130 00"] },
    { id: 6, name: "Strom", is_company: true, is_own_account: false, ibans: ["DE88100900001234567892"] },
    { id: 7, name: "Ohne IBAN", is_company: true, is_own_account: false, ibans: [] },
  ],
});

// Gruppierung + Reihenfolge
assert.deepEqual(
  groups.map((g) => g.label),
  ["Eigene Konten", "Empfängerkonten", "Zahlungspartner"],
);

// Mapping eigene Konten
assert.equal(groups[0].options[0].name, "Giro");
assert.equal(groups[0].options[0].iban, "DE89370400440532013000");

// Mapping Empfängerkonten inkl. Fallback auf account_name
assert.equal(groups[1].options[0].name, "Vermieter GmbH");
assert.equal(groups[1].options[0].iban, "DE02120300000000202051");
assert.equal(groups[1].options[1].name, "Ohne Empfängername");

// Dedupe über normalisierte IBAN: Zahlungspartner "Giro" (DE89…) fällt weg,
// "Ohne IBAN" (leer) bleibt erhalten.
assert.deepEqual(
  groups[2].options.map((o) => o.name),
  ["Strom", "Ohne IBAN"],
);

// Filter über Name, case-insensitive
const byName = filterRecipientOptions(groups, "strom");
assert.deepEqual(byName.map((g) => g.label), ["Zahlungspartner"]);
assert.deepEqual(byName[0].options.map((o) => o.name), ["Strom"]);

// Filter über IBAN
const byIban = filterRecipientOptions(groups, "2020");
assert.deepEqual(byIban.map((g) => g.label), ["Empfängerkonten"]);
assert.equal(byIban[0].options[0].name, "Vermieter GmbH");

// Leeres Query gibt alles zurück, leere Gruppen werden entfernt
assert.equal(filterRecipientOptions(groups, "   "), groups);

// Kein Treffer
assert.deepEqual(filterRecipientOptions(groups, "xyz"), []);

// Leere Eingaben -> keine Gruppen
assert.deepEqual(
  buildRecipientOptions({ ownAccounts: [], recipientAccounts: [], zahlungspartner: [] }),
  [],
);

console.log("recipient-options: ok");
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node frontend/src/lib/recipient-options.test.ts`
Expected: FAIL — `Cannot find module './recipient-options.ts'`

- [ ] **Step 3: Minimale Implementierung schreiben**

Create `frontend/src/lib/recipient-options.ts`:

```ts
import { normalizeIban } from "./iban.ts";
import type { BankAccountOption } from "./utils/accounts";
import type { RecipientAccountRecord } from "./recipient-accounts";
import type { ZahlungspartnerRecord } from "./zahlungspartner";

export type RecipientOptionKind = "own" | "recipient" | "partner";

export type RecipientOption = {
  id: string;
  name: string;
  iban: string;
  kind: RecipientOptionKind;
};

export type RecipientOptionGroup = {
  kind: RecipientOptionKind;
  label: string;
  options: RecipientOption[];
};

export function buildRecipientOptions(input: {
  ownAccounts: BankAccountOption[];
  recipientAccounts: RecipientAccountRecord[];
  zahlungspartner: ZahlungspartnerRecord[];
}): RecipientOptionGroup[] {
  const groups: RecipientOptionGroup[] = [
    {
      kind: "own",
      label: "Eigene Konten",
      options: input.ownAccounts.map((account) => ({
        id: `own:${account.accountIban}`,
        name: account.accountName,
        iban: account.accountIban,
        kind: "own" as const,
      })),
    },
    {
      kind: "recipient",
      label: "Empfängerkonten",
      options: input.recipientAccounts.map((account) => ({
        id: `recipient:${account.id}`,
        name: account.recipient_name || account.account_name,
        iban: account.iban,
        kind: "recipient" as const,
      })),
    },
    {
      kind: "partner",
      label: "Zahlungspartner",
      options: input.zahlungspartner.map((partner) => ({
        id: `partner:${partner.id}`,
        name: partner.name,
        iban: partner.ibans[0] ?? "",
        kind: "partner" as const,
      })),
    },
  ];

  const seen = new Set<string>();
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => {
        const iban = normalizeIban(option.iban);
        if (!iban) return true;
        if (seen.has(iban)) return false;
        seen.add(iban);
        return true;
      }),
    }))
    .filter((group) => group.options.length > 0);
}

export function filterRecipientOptions(
  groups: RecipientOptionGroup[],
  query: string,
): RecipientOptionGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;

  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) =>
          option.name.toLowerCase().includes(needle) ||
          option.iban.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.options.length > 0);
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `node frontend/src/lib/recipient-options.test.ts`
Expected: `recipient-options: ok`

- [ ] **Step 5: Typecheck**

Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: keine Ausgabe, Exit 0

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/recipient-options.ts frontend/src/lib/recipient-options.test.ts
git commit -m "feat: Optionslogik für Empfänger-Combobox"
```

---

### Task 2: RecipientCombobox-Komponente

**Files:**
- Create: `frontend/src/pages/transactions/components/recipient-combobox.tsx`

**Interfaces:**
- Consumes: `filterRecipientOptions`, `RecipientOption`, `RecipientOptionGroup` aus `@/lib/recipient-options` (Task 1); `Input`, `Popover`/`PopoverAnchor`/`PopoverContent`, `Command`/`CommandEmpty`/`CommandGroup`/`CommandItem`/`CommandList`.
- Produces: `RecipientCombobox` mit Props
  `{ id?: string; value: string; onValueChange: (value: string) => void; onSelect: (option: RecipientOption) => void; groups: RecipientOptionGroup[]; placeholder?: string; emptyText?: string }`.

- [ ] **Step 1: Komponente schreiben**

Create `frontend/src/pages/transactions/components/recipient-combobox.tsx`:

```tsx
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  filterRecipientOptions,
  type RecipientOption,
  type RecipientOptionGroup,
} from "@/lib/recipient-options";

type RecipientComboboxProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (option: RecipientOption) => void;
  groups: RecipientOptionGroup[];
  placeholder?: string;
  emptyText?: string;
};

export function RecipientCombobox({
  id,
  value,
  onValueChange,
  onSelect,
  groups,
  placeholder,
  emptyText = "Keine Treffer – Text wird frei übernommen",
}: RecipientComboboxProps) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterRecipientOptions(groups, value), [groups, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {filtered.map((group) => (
              <CommandGroup key={group.kind} heading={group.label}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.name}</span>
                      {option.iban ? (
                        <span className="text-muted-foreground truncate text-xs">
                          {option.iban}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

Bewusste Vereinfachung: Filterung läuft manuell (`shouldFilter={false}`) statt über cmdk, weil das sichtbare Eingabefeld außerhalb der `Command` liegt (Freitext). Dadurch keine Pfeiltasten-Navigation; nachrüsten erst, wenn Tastaturnavigation gefordert wird.

- [ ] **Step 2: Typecheck**

Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: keine Ausgabe, Exit 0

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/transactions/components/recipient-combobox.tsx
git commit -m "feat: RecipientCombobox-Komponente"
```

---

### Task 3: Sheet und Seite verdrahten

**Files:**
- Modify: `frontend/src/pages/transactions/components/manual-transaction-sheet.tsx`
- Modify: `frontend/src/pages/transactions/transactions-page.tsx:858-866`

**Interfaces:**
- Consumes: `RecipientCombobox` (Task 2), `buildRecipientOptions` (Task 1), `fetchRecipientAccountsReferenceData` + `RecipientAccountRecord` aus `@/lib/recipient-accounts`, `BankAccountOption` aus `@/lib/utils/accounts`, `ZahlungspartnerRecord` aus `@/lib/zahlungspartner`.
- Produces: `ManualTransactionSheet` mit zusätzlichen Pflicht-Props `ownAccounts: BankAccountOption[]`, `recipientAccounts: RecipientAccountRecord[]`, `zahlungspartner: ZahlungspartnerRecord[]`.

- [ ] **Step 1: Imports und Props des Sheets erweitern**

In `frontend/src/pages/transactions/components/manual-transaction-sheet.tsx` Zeile 1 ändern von:

```tsx
import { useState } from "react";
```

zu:

```tsx
import { useMemo, useState } from "react";
```

Nach dem bestehenden `CategoryCombobox`-Import (Zeile 16) einfügen:

```tsx
import { RecipientCombobox } from "./recipient-combobox";
import { buildRecipientOptions } from "@/lib/recipient-options";
import { type BankAccountOption } from "@/lib/utils/accounts";
import { type RecipientAccountRecord } from "@/lib/recipient-accounts";
import { type ZahlungspartnerRecord } from "@/lib/zahlungspartner";
```

Props-Typ (Zeilen 21-28) ersetzen durch:

```tsx
type ManualTransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountIban: string;
  accountName: string;
  categoryOptions: TransactionCategoryOption[];
  ownAccounts: BankAccountOption[];
  recipientAccounts: RecipientAccountRecord[];
  zahlungspartner: ZahlungspartnerRecord[];
  onCreated: () => void | Promise<void>;
};
```

Destrukturierung (Zeilen 37-44) ersetzen durch:

```tsx
export function ManualTransactionSheet({
  open,
  onOpenChange,
  accountIban,
  accountName,
  categoryOptions,
  ownAccounts,
  recipientAccounts,
  zahlungspartner,
  onCreated,
}: ManualTransactionSheetProps) {
```

- [ ] **Step 2: Gruppen berechnen**

Nach `const [saving, setSaving] = useState(false);` (Zeile 52) einfügen:

```tsx
  const recipientGroups = useMemo(
    () => buildRecipientOptions({ ownAccounts, recipientAccounts, zahlungspartner }),
    [ownAccounts, recipientAccounts, zahlungspartner],
  );
```

- [ ] **Step 3: Empfänger-Feld ersetzen**

Den Block (Zeilen 122-130)

```tsx
          <div className="grid gap-2">
            <Label htmlFor="manual-recipient">Empfänger / Auftraggeber</Label>
            <Input
              id="manual-recipient"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              autoComplete="off"
            />
          </div>
```

ersetzen durch:

```tsx
          <div className="grid gap-2">
            <Label htmlFor="manual-recipient">Empfänger / Auftraggeber</Label>
            <RecipientCombobox
              id="manual-recipient"
              value={recipient}
              onValueChange={setRecipient}
              groups={recipientGroups}
              onSelect={(option) => {
                setRecipient(option.name);
                if (option.iban) setRecipientIban(option.iban);
              }}
            />
          </div>
```

- [ ] **Step 4: Seite: Empfängerkonten laden**

In `frontend/src/pages/transactions/transactions-page.tsx` nach dem `zahlungspartner`-Import (Zeile 23) einfügen:

```tsx
import {
  fetchRecipientAccountsReferenceData,
  type RecipientAccountRecord,
} from "@/lib/recipient-accounts";
```

Nach `const [zahlungspartner, setZahlungspartner] = useState<ZahlungspartnerRecord[]>([]);` (Zeile 74) einfügen:

```tsx
  const [recipientAccounts, setRecipientAccounts] = useState<RecipientAccountRecord[]>([]);
```

Nach dem `useEffect`, der `loadZahlungspartnerData` aufruft (endet Zeile 133), einfügen:

```tsx
  useEffect(() => {
    let active = true;

    void fetchRecipientAccountsReferenceData()
      .then((data) => {
        if (active) setRecipientAccounts(data.recipient_accounts);
      })
      .catch(() => {
        if (active) setRecipientAccounts([]);
      });

    return () => {
      active = false;
    };
  }, []);
```

- [ ] **Step 5: Seite: Props durchreichen**

Den `ManualTransactionSheet`-Aufruf (Zeilen 859-866) erweitern:

```tsx
        <ManualTransactionSheet
          open={manualSheetOpen}
          onOpenChange={setManualSheetOpen}
          accountIban={selectedBank.accountIban}
          accountName={selectedBank.accountName}
          categoryOptions={categoryOptions}
          ownAccounts={linkedAccounts}
          recipientAccounts={recipientAccounts}
          zahlungspartner={zahlungspartner}
          onCreated={reload}
        />
```

- [ ] **Step 6: Typecheck + Build**

Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: keine Ausgabe, Exit 0

Run: `pnpm --dir frontend build`
Expected: `✓ built in …`, Exit 0

- [ ] **Step 7: Manueller Smoke-Test**

Run: `pnpm dev`
Prüfen:
1. Manuelles Konto öffnen → "Transaktion hinzufügen".
2. Empfänger-Feld fokussieren → Dropdown zeigt Gruppen "Eigene Konten", "Empfängerkonten", "Zahlungspartner".
3. Tippen filtert über Name und IBAN.
4. Empfängerkonto auswählen → Name **und** IBAN werden gefüllt.
5. Zahlungspartner "Ohne IBAN" auswählen → nur Name wird gesetzt, IBAN-Feld unverändert.
6. Freitext eingeben → Dropdown leer-Hinweis, Text bleibt erhalten, Speichern funktioniert.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/transactions/components/manual-transaction-sheet.tsx frontend/src/pages/transactions/transactions-page.tsx
git commit -m "feat: Empfänger-Combobox im Transaktions-Formular verdrahtet"
```

---

## Self-Review

- **Spec-Coverage:** Optionslogik (Task 1), Komponente (Task 2), Verdrahtung inkl. Laden der Empfängerkonten (Task 3) — alle Spec-Abschnitte abgedeckt.
- **Placeholder:** keine.
- **Typkonsistenz:** `RecipientOption`/`RecipientOptionGroup` in Task 1 definiert und in Task 2/3 identisch verwendet; `ownAccounts: BankAccountOption[]` entspricht `linkedAccounts` aus `useFinanceData`.
