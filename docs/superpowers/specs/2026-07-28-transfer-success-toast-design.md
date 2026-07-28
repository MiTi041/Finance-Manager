# Transfer Success Toast

## Problem
Nach erfolgreicher Überweisung schließt der Dialog ohne Feedback — der User sieht keine Bestätigung.

## Lösung
Sonner-Toast mit einer Loader→Checkmark-Crossfade-Animation via `motion`.

## Komponente
- `frontend/src/components/success-toast.tsx`
- Props: `toastId: string | number`
- Phase 1 (1200ms): rotierender Circle + "Überweisung wird durchgeführt…"
- Phase 2: grüner Checkmark (spring animation) + "Überweisung erfolgreich!"; schließt nach 2500ms

## Integration
- `allocation-page.tsx` — `confirmTransfer` zeigt toast nach erfolgreichem `transfer`/`transferSavings`
- `transfer`/`transferSavings` laden bereits Daten neu — toast ist reines visuelles Feedback

## Dev-Modus
- Kleiner Floating-Button (bottom-right) bei `import.meta.env.DEV`
- Simuliert den Toast ohne API-Call
