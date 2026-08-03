# Bafög-Anlagezinsen auf die Rücklage

**Datum:** 2026-08-03

## Problem

Das Geld, das auf der Bafög-Rücklage liegt, wird verzinst (Anlagezins). Der
Ist-Betrag (`saved_total`) des Bafög-Buckets bildet das nicht ab und driftet
dadurch mit der Zeit von der Realität weg. Der Anlagezins ist reine Buchhaltung
(keine echte Bankbuchung) und wird in der Ratenberechnung
(`required_monthly_rate` via `zins_service.py`) bereits berücksichtigt.

## Lösung: manuelle Zins-Eingabe

Der automatische Ansatz wurde verworfen: Die Rechnung (2,5 % konfiguriert) wich
vom Konto ab (2,55 % real), und die Zinshöhe ist nicht deterministisch
ableitbar. Stattdessen trägt der Nutzer die erhaltenen Zinsen manuell ein.

1. Neue Spalte `anlagezinsen REAL NOT NULL DEFAULT 0` in
   `allocation_bafoeg_config` (Migration via `_ensure_table_columns`).
2. `allocation_service.py` (bafoeg-Zweig):
   `saved_total = current_balance + einzahlungen + anlagezinsen`.
3. Frontend-Settings-Popover (`bucket-settings-popover.tsx`): eigene
   Section "Zinsen" mit Anzeige des Gesamtbetrags "Bisher erhaltene Zinsen",
   Input + "Hinzufügen"-Button. Jeder Klick addiert den Betrag zum
   Gesamtbetrag und speichert via `updateBafoegConfig` (kein Verlauf).

## Nicht gemacht (YAGNI)

- Automatische Zins-Berechnung / Zins-Simulation
- Detail-Row "davon Anlagezinsen" im Frontend
