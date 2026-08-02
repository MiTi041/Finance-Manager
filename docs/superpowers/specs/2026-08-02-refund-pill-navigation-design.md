# Rückerstattungs-Pill: Zeile aufklappen + zur Rückerstattungs-Sektion scrollen

## Kontext

Der Rückerstattungs-Pill in der zusammengeklappten Transaktionszeile (`frontend/src/pages/transactions/components/collapsed-row.tsx`) zeigt den Rückerstattungsbetrag, ist aber aktuell ein inertes `<span>`. Die Rückerstattungs-Sektion existiert nur in der expandierten Zeile (`frontend/src/pages/transactions/components/transaction-row.tsx`).

**Ziel:** Klick auf den Pill klappt die Zeile auf (falls nötig) und scrollt zur Rückerstattungs-Sektion. Gilt für beide Fälle: Einnahme mit Rückerstattungs-Links (`RefundSectionIncoming`) und Ausgabe mit Rückerstattungen (`RefundSectionOutgoing`). Kein visuelles Highlight.

## Änderungen

### 1. `collapsed-row.tsx`

- Pill (`<span>` mit `Undo2` + Betrag) wird klickbar: `<span role="button" tabIndex={0}>`.
- `onClick` mit `event.stopPropagation()`, damit die Zeile nicht selbst togglet; `onKeyDown` für Enter/Space.
- Neu: Prop `onOpenRefundSection: (transactionId: number) => void` — wird mit `transaction.id` aufgerufen.
- Hover-Styling + `cursor-pointer` analog zum Abonnement-Pill.

### 2. `transaction-row.tsx`

- `onOpenRefundSection` als Prop durchreichen an `CollapsedRow`.
- Refund-Section-Wrapper (`transaction-row.tsx:218`) bekommt `id={`refund-section-${transaction.id}`}` als Scroll-Ziel.

### 3. `transactions-page.tsx`

- `pendingRefundScrollRef = useRef<number | null>(null)`.
- `openRefundSection(id)`:
  - Ist die Zeile bereits expandiert (`expandedTransactionId === id`) → direkt scrollen.
  - Sonst: `toggleRow(id)` (nutzt den bestehenden Unsaved-Changes-Confirm-Flow) und `pendingRefundScrollRef.current = id` setzen.
- `useEffect` auf `expandedTransactionId`: wenn `pendingRefundScrollRef.current === expandedTransactionId`, dann `requestAnimationFrame` → `document.getElementById("refund-section-<id>")?.scrollIntoView({ behavior: "smooth", block: "center" })`, Ref leeren.

## Scope

- Keine visuelle Hervorhebung (nur Scroll).
- Keine Backend-Änderungen.
- Keine neuen Dependencies.

## Verifikation

- Lint/Typecheck des Frontends (`pnpm -C frontend lint` / `typecheck`).
- Manuell: Pill auf Einnahme- und Ausgaben-Zeile klicken → Zeile klappt auf, Sektion ist im Viewport.
