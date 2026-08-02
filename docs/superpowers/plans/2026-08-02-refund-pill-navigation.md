# Rückerstattungs-Pill Navigation — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klick auf den Rückerstattungs-Pill klappt die Transaktionszeile auf (falls nötig) und scrollt die Rückerstattungs-Sektion in den Viewport — für Einnahmen und Ausgaben.

**Architecture:** Der Pill in `collapsed-row.tsx` wird zu einem klickbaren Element, das einen neuen `onOpenRefundSection`-Callback aufruft. `transactions-page.tsx` expandiert die Zeile über den bestehenden `toggleRow`-Flow (inkl. Unsaved-Changes-Confirm) und scrollt per `scrollIntoView` zu einem `id`-Anker auf der Refund-Section. Kein visuelles Highlight.

**Tech Stack:** React 19 + TypeScript + Tailwind/shadcn-ui. Virtualized-Liste (`@tanstack/react-virtual` über `virtualized-list.tsx`).

## Global Constraints

- Frontend-Verifikation: `pnpm --dir frontend exec tsc --noEmit` und `pnpm --dir frontend exec eslint src/pages/transactions/components/collapsed-row.tsx src/pages/transactions/components/transaction-row.tsx src/pages/transactions/transactions-page.tsx`.
- Keine neuen Abhängigkeiten.
- Keine visuelle Hervorhebung der Sektion (nur Scroll).
- Der Working-Tree enthält unabhängige, uncommittete Änderungen (`button.tsx`, `category-section.tsx`, `collapsed-row.tsx`). Nur die im jeweiligen Commit gelisteten Dateien stagen — niemals `git add .` oder `git add -A`. Uncommitete Änderungen in `collapsed-row.tsx` gehören dem Developer-Team; der Task fügt nur die eigenen Hunk-Änderungen hinzu, ohne fremde Änderungen zu stagen.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `frontend/src/pages/transactions/components/collapsed-row.tsx` | Pill klickbar machen, `onOpenRefundSection`-Prop |
| `frontend/src/pages/transactions/components/transaction-row.tsx` | Prop durchreichen, `id`-Anker auf Refund-Section |
| `frontend/src/pages/transactions/transactions-page.tsx` | `openRefundSection` + Scroll-Effekt |

---

### Task 1: Klickbarer Pill + Prop-Threading

**Files:**
- Modify: `frontend/src/pages/transactions/components/collapsed-row.tsx`
- Modify: `frontend/src/pages/transactions/components/transaction-row.tsx`
- Modify: `frontend/src/pages/transactions/transactions-page.tsx`

**Interfaces:**
- Produces: `onOpenRefundSection: (transactionId: number) => void` Prop auf `CollapsedRow` und `TransactionRow`; Anker `id="refund-section-<transaction.id>"` auf dem Refund-Section-Wrapper.

- [ ] **Step 1: Prop auf `CollapsedRow` ergänzen und Pill klickbar machen**

In `frontend/src/pages/transactions/components/collapsed-row.tsx`:

1. Im Typ `CollapsedRowProps` (Zeile 18-33) nach `onToggleRow` ergänzen:

```ts
  onOpenRefundSection: (transactionId: number) => void;
```

2. In der Destrukturierung der Props (Zeile 35-50) nach `onToggleRow` ergänzen:

```ts
  onOpenRefundSection,
```

3. Den Refund-Pill (aktuell Zeile 251-264) von inertem `<span>` auf klickbares Element umstellen. Das aktuelle `<TooltipTrigger asChild>` + `<span>`-Konstrukt wird:

```tsx
            {(isRefund || hasRefunds) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenRefundSection(transaction.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenRefundSection(transaction.id);
                      }
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-500/20 transition-colors dark:text-amber-400 tabular-nums"
                  >
                    <Undo2 className="size-3" />
                    {formatAmount(
                      isRefund ? transaction.betrag.wert : linkedRefundTotal,
                      transaction.betrag.waehrung,
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Rückerstattungsbetrag</TooltipContent>
              </Tooltip>
            )}
```

Hinweis: `event.stopPropagation()` auf `onClick` ist nötig, weil der Pill innerhalb des Row-`<button>` (Zeile 83) liegt — ein Klick darf das Row-Toggle nicht auslösen.

- [ ] **Step 2: Prop durch `TransactionRow` reichen und Anker setzen**

In `frontend/src/pages/transactions/components/transaction-row.tsx`:

1. Im Typ `TransactionRowProps` (Zeile 25-56) nach `onToggleRow` ergänzen:

```ts
  onOpenRefundSection: (transactionId: number) => void;
```

2. In der Destrukturierung der Props (Zeile 58-89) nach `onToggleRow` ergänzen:

```ts
  onOpenRefundSection,
```

3. Im `<CollapsedRow>`-Aufruf (Zeile 156-171) nach `onToggleRow={onToggleRow}` ergänzen:

```tsx
        onOpenRefundSection={onOpenRefundSection}
```

4. Auf dem Refund-Section-Wrapper (Zeile 218) die `id` ergänzen:

```tsx
                <div id={`refund-section-${transaction.id}`} className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
```

- [ ] **Step 3: `openRefundSection` in der Page implementieren**

In `frontend/src/pages/transactions/transactions-page.tsx`:

1. Nach der bestehenden Deklaration `const virtualListRef = useRef<VirtualizedListRef>(null);` (Zeile 84) ein weiteres Ref ergänzen:

```ts
  const pendingRefundScrollRef = useRef<number | null>(null);
```

2. Nach der Funktion `toggleRow` (endet Zeile 366) die Scroll-Funktion ergänzen:

```ts
  const scrollToRefundSection = useCallback((id: number) => {
    requestAnimationFrame(() => {
      document.getElementById(`refund-section-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, []);

  const openRefundSection = (id: number) => {
    if (expandedTransactionId === id) {
      scrollToRefundSection(id);
      return;
    }
    pendingRefundScrollRef.current = id;
    toggleRow(id);
  };
```

3. Einen Effekt ergänzen, der nach der Expansion scrollt. Direkt unter `openRefundSection`:

```ts
  useEffect(() => {
    const pendingId = pendingRefundScrollRef.current;
    if (pendingId === null) return;
    if (expandedTransactionId !== pendingId) return;
    pendingRefundScrollRef.current = null;
    scrollToRefundSection(pendingId);
  }, [expandedTransactionId, scrollToRefundSection]);
```

4. Im `<TransactionRow>`-Aufruf (Zeile 624-663) nach `onToggleRow={toggleRow}` ergänzen:

```tsx
              onOpenRefundSection={openRefundSection}
```

Hinweis: `useEffect` und `useCallback` sind bereits importiert (Zeile 1).

- [ ] **Step 4: Typecheck und Lint**

Run:
```bash
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec eslint src/pages/transactions/components/collapsed-row.tsx src/pages/transactions/components/transaction-row.tsx src/pages/transactions/transactions-page.tsx
```
Expected: beide Befehle beenden mit Exit-Code 0 ohne Fehler.

- [ ] **Step 5: Manuell verifizieren**

Starte die App (`pnpm dev`) und prüfe:
1. Einnahme-Zeile mit Rückerstattungs-Links: Pill-Klick klappt die Zeile auf, die Refund-Section („Diese Gutschrift ist eine Rückerstattung für") wird in den Viewport gescrollt.
2. Ausgabe-Zeile mit Rückerstattungen: Pill-Klick klappt auf, die Sektion („Rückerstattungen für diese Ausgabe") wird gescrollt.
3. Bereits expandierte Zeile: Pill-Klick scrollt nur, klappt nicht zu.
4. Enter/Space auf dem Pill (mit Fokus) löst dasselbe aus.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/transactions/transactions-page.tsx frontend/src/pages/transactions/components/transaction-row.tsx frontend/src/pages/transactions/components/collapsed-row.tsx
git commit -m "feat(refunds): make refund pill expand row and scroll to refund section"
```

Hinweis: `git add` nur für diese drei Dateien (siehe Global Constraints). Der Hunk von `collapsed-row.tsx` stammt aus diesem Task; vorhandene uncommitete Änderungen an derselben Datei gehen damit ebenfalls in den Commit ein — nur wenn sie stören, vorher mit dem Team absprechen.
