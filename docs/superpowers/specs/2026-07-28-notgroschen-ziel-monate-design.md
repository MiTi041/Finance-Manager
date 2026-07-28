# Notgroschen: Ziel & Restmonate

## Problem

Der Notgroschen-Bucket zeigt nur das monatliche Ziel (Allokation diesen Monats) und
den Fortschritt (überwiesen diesen Monat). Es fehlt eine langfristige Perspektive:
- Wie viel ist insgesamt already im Notgroschen?
- Was ist das Sparziel (z.B. 3 Monatsgehälter oder 5.000 €)?
- Wie viele Monate dauert es noch, das Ziel zu erreichen?

## Ziel

- Benutzer kann im Notgroschen-Popover ein Ziel konfigurieren:
  - **Festbetrag** (z.B. 5.000 €)
  - **Monatsgehälter** (z.B. 3 → Ziel = 3 × Netto-Einkommen)
  - Beide schließen sich aus
- Die Karte zeigt:
  - Sparziel
  - Fortschritt gesamt (bisher gespart vs. Ziel)
  - Prognose: "Noch ~X Monate bei aktueller Rate"

## Änderungen

### DB: `allocation_buckets`

```sql
target_amount REAL   -- optionaler Festbetrag (NULL = nicht gesetzt)
target_months REAL   -- optionaler Multiplikator (NULL = nicht gesetzt)
```

Migration via `_ensure_table_columns` in `schema.py`.

### Backend: `allocation_service.py` – `_build_run_response`

**Gesamt erspart (all-time):**
Summe aller `tag.notfallfonds`-Transaktionen MIT Vorzeichen:
- Negative Buchungen (ausgehend, Überweisung zum Konto) → sparen → addiere Absolutbetrag
- Positive Buchungen (eingehend, Entnahme vom Konto) → abziehen → subtrahiere Betrag

SQL-Query über alle Monate (nicht nur aktuellen Monat).

**Ziel-Berechnung:**
```python
if bucket.target_months and bucket.target_months > 0:
    goal = round(net_income * bucket.target_months, 2)
elif bucket.target_amount and bucket.target_amount > 0:
    goal = bucket.target_amount
else:
    goal = None
```

**Restmonate:**
```python
remaining = max(0, goal - saved_total)
months = math.ceil(remaining / monthly_rate) if monthly_rate > 0 else None
```

Neue Felder im Response (nur für emergency Bucket):
- `saved_total`: float — gesamtes Erspartes aus tag.notfallfonds
- `goal_amount`: float | None — berechnetes Ziel
- `goal_months`: float | None — gespeicherter target_months-Wert
- `goal_label`: str — Anzeigetext (z.B. "3 Monatsgehälter" oder "5.000,00 €")
- `months_left`: int | None — Prognose

### Frontend: `bucket-card.tsx`

**Neuer Abschnitt auf der Karte** (unter dem Monatsziel, nur für emergency):
- Wenn goal gesetzt:
  - "Sparziel: 3 Monatsgehälter (3.275 €)"
  - Fortschrittsbalken: "1.200 € von 3.275 €" + Prozent
  - "Noch ~7 Monate bei aktueller Rate"
- Wenn kein goal: nichts anzeigen (Status quo)

**Popover-Erweiterung:**
- Neuer Abschnitt "Sparziel" unter "Verteilung":
  - Zwei Radio-Optionen: "Festbetrag" / "Monatsgehälter"
  - Abhängig davon ein Input-Feld
  - Beide Werte können leer/null sein → kein Ziel
  - Beim Speichern wird der jeweils andere Wert auf null gesetzt

### Fix: Notgroschen-Erspartes mit Vorzeichen

Aktuell verwendet `_build_run_response` für das monatliche transferred:
```sql
SELECT COALESCE(SUM(ABS(amount)), 0) FROM umsaetze
```
Das zählt Entnahmen (positive Buchungen mit tag.notfallfonds) fälschlich dazu.

Fix für den all-time Saldo:
```sql
SELECT COALESCE(SUM(
    CASE WHEN amount < 0 THEN ABS(amount) ELSE -amount END
), 0) FROM umsaetze WHERE purpose LIKE ?
```
→ Negative = sparen (addieren), Positive = entnehmen (subtrahieren)

## Umsetzungsschritte

1. DB-Schema: Migration für `target_amount` + `target_months`
2. Backend: `_build_run_response` – all-time Saldo, Zielberechnung, Restmonate
3. Backend: Neue Felder im API-Response
4. Frontend: Popover – Ziel-Konfiguration
5. Frontend: Karte – Ziel-Anzeige & Restmonate
6. Test & Feinschliff
