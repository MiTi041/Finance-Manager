# Transfer System Vereinfachung

## Problem
Transfers funktionieren in `finance_local` zuverlässig, aber in `Finance` nicht.
Die Finance-Implementierung ist über mehrere Dateien verteilt und enthält
Abweichungen zur erprobten Logik aus `finance_local`.

## Lösung
Die Transfer-Logik aus `finance_local` als Basis nehmen und in die
Finance-Struktur portieren — mit `BankCredentials`-Abstraktion statt
Hardcoded-Env-Vars.

## Geänderte Dateien

### `backend/finance_server/fints/client.py`
- `validate_transfer_result`: `decoupled=False` für Code 9160 (Bugfix)
- `make_client`: `minimal_interactive_cli_bootstrap` verwenden statt
  manuellem `fetch_tan_mechanisms` + `selected_tan_medium`
- Tan-Handling (`resolve_tan`, `resolve_tan_until_done`) aus
  `finance_local` übernehmen
- State-Handling vereinfachen

### `backend/finance_server/fints/transfer.py`
- `send_transfer` 1:1 aus `finance_local` übernehmen
- Statt Direktaufruf von Environment-Variablen: `BankCredentials` + `banks.py` nutzen
- Sparkasse-923-Monkey-Patch bleibt erhalten

### `backend/finance_server/api/fints/transfer.py`
- Unverändert (ist bereits schlank und korrekt)

### `backend/finance_server/api/allocation.py`
- Error-Handling prüfen, ggf. konsistent machen

## Beibehaltene Finance-Features
- `BankCredentials`-Modell + DB-Persistenz
- `banks.py` mit `BankDefinition`
- Multi-Credential State-Files
- Sparkasse-923-Monkey-Patch
- Allocation/Bucket/Savings-Plan-Endpunkte
