# Budgets-Seite: Feinschliff

Datum: 2026-07-31
Status: Approved

## Ziel

Budgets-Seite (`frontend/src/pages/budgets/budgets-page.tsx`) optisch und interaktiv aufräumen. Umfang: **nur die Budgets-Seite**, keine Sidebar/übrige App.

## Änderungen

### 1. Budget-Karte (BudgetRow) — Stil wie Sparpläne

- **Kopfzeile:** Icon in runder Badge (`size-9 rounded-full bg-muted`) + Name links; rechts **Status-Pill** + `⋮`-Dropdown (Popover wie bei Sparplänen, `align="end"`, `w-44 p-1`).
- **Status-Pill** nach Verbrauch (Badge-Style `rounded-full px-2 py-0.5 text-xs font-medium`):
  - `< 70 %` → „Im Plan" (`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`)
  - `70–100 %` → „Fast erreicht" (`bg-amber-500/10 text-amber-600 dark:text-amber-400`)
  - `> 100 %` → „Überzogen" (`bg-red-500/10 text-red-600 dark:text-red-400`)
- **Dropdown (Popover, Muster `savings-plans-card.tsx`):**
  - **Bearbeiten** (Pencil) → öffnet Bearbeiten-Dialog; schließt das Popover vorher.
  - **Löschen** (Trash2, `text-destructive hover:bg-destructive/10`) → `onDelete(budget.id)`, direkt (kein Bestätigungsdialog).
- **Betrag-Zeile:** `formatAmount(spent) / formatAmount(monthly_amount)` (fett, `tabular-nums`; Schrägstrich `font-normal text-muted-foreground`).
- **Fortschritt:** Balken `h-2.5 w-full` (Farbe: `ratio > 1` rot, `>= 0.7` gelb, sonst grün), darunter **„{n} % vom Budget genutzt"** in Balkenfarbe (`color.replace("bg-", "text-")`). Ersetzt die frühere „ausgegeben · übrig"-Zeile.
- Das Klick-zum-Bearbeiten am Betrag entfällt (Bearbeiten wandert ins Dropdown).

### 2. Bearbeiten-Dialog

- `Dialog` auf Seiten-Ebene (State: `editingBudget: Budget | null`, `editAmount: string`, `editing: boolean`).
- Titel „Budget bearbeiten", darunter Kategoriename (`text-sm text-muted-foreground`).
- Betragsfeld mit €-Suffix (Muster wie Add-Dialog: `relative`-Wrapper, `pr-8`, € absolut rechts), `autoFocus`, Enter speichert.
- Footer: „Abbrechen" (Ghost) / „Speichern" (`disabled` ohne gültigen Betrag), beim Speichern `updateBudget` + `load()`. `onOpenChange={false}` schließt nur, wenn nicht gerade gespeichert wird.

### 3. Header-Karte (unverändert aus bisherigem Feinschliff)

- Stats (Budget/Ausgegeben/Übrig) mit Icons (`Wallet`/`Receipt`/`PiggyBank`) und `border-l`-Trennern.
- Monatsnav + „Heute"-Button (nur wenn `month !== currentMonth()`).

### 4. Add-Dialog (unverändert aus bisherigem Feinschliff)

- Kategorie-Zeile mit Icon-Badge, `cursor-pointer`, Auswahl `border-primary bg-primary/10 ring-2 ring-primary/20`.
- Betragsfeld mit €-Suffix.

### 5. Cursor-Pointer

- `cursor-pointer` an allen klickbaren Elementen der Seite (Dropdown-Buttons, Kategorie-Buttons, Monatsnav, Heute, „Budget hinzufügen").

## Bewusst weggelassen

- Bestätigungsdialog beim Löschen (Budget trivial neu anlegbar, vorher auch direkt gelöscht), Prozent-Label-Cap bei extremer Überziehung, Responsive-Anpassungen, Sidebar.
