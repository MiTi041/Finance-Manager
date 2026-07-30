# Bucket-Card Refactor Design

## Problem
`bucket-card.tsx` ist 1021 Zeilen — eine Monster-Component mit 5 logisch unabhängigen Blöcken (Settings-Popover, Progress-Bar, Details, Footer, BaföG-Tilgung).

## Split

### 1. `bucket-card.tsx` (Shell ~200 Zeilen)
- Card, Header (Icon + Title + Description), Constants (bucketLabels, bucketIcons, bucketAccents, helpers)
- Hält die derived state (progress, isPaid, bafoeg-figures etc.)
- Orchestriert 4 Sub-Components

### 2. `bucket-settings-popover.tsx` (~370 Zeilen)
- Kompletter Settings-Popover: BaföG-Konfig // Prozent-Slider + Preview // Sparziel (Emergency) // Konten (Empfänger + Absender)
- Props: bucket-type, config, bafoegConfig state, localPct/localGoalAmount/localGoalMonths/localBafoeg* state + callbacks

### 3. `bucket-progress.tsx` (~120 Zeilen)
- 3 Varianten: normal (einfarbiger Bar + caption), spending (info bar + ausgegeben), bafoeg (3-segment bar + caption)
- Plus: invest-row (Netto investiert), donation-button
- Props: bucket, accent, isInfoOnly, bafoegActive, hasBafoegGoal, hasEmergencyGoal + bafoeg-derived-figures + onAnalyse

### 4. `bucket-details.tsx` (~80 Zeilen)
- Collapsible Details-Panel mit DetailRow
- Emergency: months_left
- Bafoeg: outstanding debt, required rate, month payments, months left, income events
- Tag
- Props: hasDetails + bucket-type-spezifische values

### 5. `bucket-footer.tsx` (~150 Zeilen)
- Bafoeg: paid badge, no-recipient warning, transfer button, debt-repayment slider
- Other: paid badge, no-recipient warning, transfer button
- Props: bucket-type, hasRecipient, isPaid, isInfoOnly, bafoeg* values + callbacks

## State Ownership
- `detailsOpen`, `sliderValues` — jeweils im Sub-Component, nicht im Parent
- `localPct`, `localGoalAmount`, `localGoalMonths`, `bafoegConfig` state — bleiben in `bucket-card.tsx`, werden an die Sub-Components gereicht
