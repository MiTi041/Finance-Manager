# Design Doc: Serverless Cross-Device Sync

**Datum:** 2026-07-24
**Betrifft:** Finance App — Electron (Desktop) + Flutter (Mobile)
**Status:** Entwurf

## 1. Ziel

Sichere, serverlose Synchronisation aller Finanzdaten zwischen mehreren Geräten (Mac, Windows Laptop, iPhone, Android), ohne dass unverschlüsselte Daten jemals ein Gerät verlassen. Jeder Benutzer betreibt seine eigene Sync-Infrastruktur in Cloudflare R2.

## 2. System-Architektur

### 2.1 Prinzip

- Jedes Gerät hat eine vollständige lokale SQLite-Datenbank
- Änderungen werden in einem Operation-Log (Tabelle `sync_ops`) aufgezeichnet
- Ein Hintergrund-Sync-Service teilt Ops via **Cloudflare R2** (S3-kompatibel)
- Alle Ops sind AES-256-GCM-verschlüsselt — R2 sieht nur undurchschaubare Bytes
- Konfliktauflösung: **Last-Write-Wins** pro Zeile via `updated_at`
- Jeder Benutzer hat seinen eigenen R2-Bucket + API-Token

### 2.2 Komponenten

```
┌──────────────┐     ┌──────────────┐
│  Electron    │     │  Flutter     │
│  (Desktop)   │     │  (iOS/Droid) │
├──────────────┤     ├──────────────┤
│ Python:      │     │ Dart:        │
│ - FastAPI    │     │ - sqflite    │
│ - FinTS Sync │     │ - Sync Svc  │
│ - ML/Kategor.│     │ - AES-GCM   │
│ - Sync Svc   │     │ - R2 SDK    │
│ - AES-GCM    │     │              │
│ - R2 SDK     │     │              │
├──────────────┤     ├──────────────┤
│ SQLite lokal │     │ SQLite lokal │
└──────┬───────┘     └──────┬───────┘
       │                    │
       └─────────┬──────────┘
                 │
        ┌────────▼────────┐
        │  Cloudflare R2  │
        │ finance-sync/   │
        │ (nur encrypted  │
        │  Bytes)         │
        └─────────────────┘
```

### 2.3 Desktop vs Mobile

| | Desktop (Electron) | Mobile (Flutter) |
|---|---|---|
| Banking-Import (FinTS) | ✅ | ❌ |
| ML-Kategorisierung | ✅ | ❌ |
| Kategorien bearbeiten | ✅ | ✅ |
| Transaktionen annotieren | ✅ | ✅ |
| Sync alle 30s | ✅ | ✅ |
| Lokale SQLite | ✅ | ✅ |

## 3. Datenmodell

### 3.1 `sync_ops` — Change-Log Tabelle

```sql
CREATE TABLE sync_ops (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    table_name  TEXT NOT NULL,
    row_id      INTEGER,
    op_type     TEXT NOT NULL CHECK(op_type IN ('INSERT','UPDATE','DELETE')),
    data        TEXT,         -- JSON: vollständiger Row-State nach der Operation
    checksum    TEXT,         -- SHA-256(data)
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sync_ops_device_seq ON sync_ops(device_id, seq);
```

### 3.2 `sync_state` — Metadaten

```sql
CREATE TABLE sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Einträge:
-- local_device_id        = UUID (beim ersten Start generiert)
-- last_pushed_seq        = 0 (letzte hochgeladene lokale seq)
-- remote_{device_id}_seq = 0 (letzte von {device} gesehene seq)
-- sync_key_id            = SHA-256 des Sync-Materials (hex)
```

### 3.3 `app_settings` — neue Einträge

| Key | Value |
|---|---|
| `sync_enabled` | `true` / `false` |
| `sync_r2_bucket` | `finance-sync` |
| `sync_r2_account_id` | Cloudflare Account ID |
| `sync_r2_access_key_id` | R2 API Access Key (verschlüsselt mit Fernet) |
| `sync_r2_secret_access_key` | R2 API Secret Key (verschlüsselt mit Fernet) |
| `sync_device_name` | Anzeigename (z.B. "MacBook") |

## 4. Cloudflare R2 Setup (pro Benutzer)

### 4.1 Einmalige Einrichtung

1. Cloudflare Dashboard → R2 Object Storage → Bucket `finance-sync` erstellen
2. R2 → Settings → CORS Policy:
   ```json
   [{
     "AllowedOrigins": ["*"],
     "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
     "AllowedHeaders": ["*"]
   }]
   ```
3. R2 → Manage API Tokens → Create API Token:
   - Permission: **Object Read & Write**
   - Bucket: `finance-sync`
   - → **Access Key ID** + **Secret Access Key** kopieren

### 4.2 R2-Ordnerstruktur

```
finance-sync/
├── key_id                          # SHA-256 des Sync-Keys (Public Identifier)
├── devices/
│   ├── <device_id>.json            # {name, device_id, first_seen, last_seen}
│   └── ...
└── ops/
    ├── <device_id_1>/
    │   ├── 000001.enc
    │   ├── 000002.enc
    │   └── ...
    └── <device_id_2>/
        └── ...
```

## 5. Verschlüsselung

### 5.1 PBKDF2 — Sync-Key Ableitung

```python
salt = b"finance-sync-v1"           # fest, öffentlich
iterations = 600_000                 # OWASP Recommended Minimum
key = PBKDF2(passwort, salt, iterations, SHA-256)  # → 32 Bytes (AES-256)
key_id = SHA-256(key)[:16].hex()
```

- Sync-Passwort wird **nie gespeichert**
- Nur der abgeleitete AES-256-Key wird in OS-Keychain gespeichert
- `key_id` dient zur Identifikation — ein Gerät mit anderem Key-ID findet nicht in den Sync

### 5.2 AES-256-GCM — Batch-Verschlüsselung

```python
def encrypt_batch(ops: list[dict], key: bytes) -> bytes:
    nonce = os.urandom(12)
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher.encrypt_and_digest(json.dumps(ops).encode())
    return nonce + ciphertext + tag   # 12 + N + 16 Bytes

def decrypt_batch(payload: bytes, key: bytes) -> list[dict]:
    nonce, ct, tag = payload[:12], payload[12:-16], payload[-16:]
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    data = cipher.decrypt_and_verify(ct, tag)
    return json.loads(data)
```

### 5.3 Key-Speicherung

| Plattform | Mechanismus |
|---|---|
| macOS Desktop | Keychain (`security add-generic-password`) |
| Windows Desktop | Credential Manager |
| iOS (Flutter) | Keychain Services (`flutter_secure_storage`) |
| Android (Flutter) | EncryptedSharedPreferences |

## 6. Sync-Protokoll

### 6.1 Erst-Setup (pro Gerät)

1. Benutzer gibt Sync-Passwort ein
2. PBKDF2 → AES-256-Key → Speicherung in Keychain
3. `sync_state` anlegen: `local_device_id=UUID, last_pushed_seq=0`
4. R2-Verbindung testen (PUT `key_id` falls nicht existiert, PUT `devices/{id}.json`)
5. Wenn bereits andere Devices existieren → Pull alle vorhandenen Ops

### 6.2 Push-Zyklus (alle 30s)

```
1. SELECT * FROM sync_ops WHERE id > last_pushed_seq ORDER BY id LIMIT 100
2. Falls vorhanden:
   a. AES-256-GCM verschlüsseln
   b. PUT ops/{device_id}/{start_seq:06d}.enc nach R2
3. last_pushed_seq = max(seq)
```

### 6.3 Pull-Zyklus (alle 30s)

```
1. R2-Liste: ops/{other_device}/ für jedes bekannte Device
2. Für jede neue Datei (seq > remote_{device}_seq):
   a. GET → AES-256-GCM entschlüsseln → nach seq sortieren
   b. Für jede Op:
      - INSERT/UPDATE: SQL mit updated_at-Prüfung
        "INSERT INTO target (…) VALUES (…)
         ON CONFLICT(id) DO UPDATE SET …
         WHERE target.updated_at IS NULL OR target.updated_at < incoming.updated_at"
      - DELETE: DELETE FROM target WHERE id = ?
3. remote_{device}_seq aktualisieren
```

### 6.4 Konfliktauflösung

- **Prinzip:** Last-Write-Wins via `updated_at`
- Ältere Daten werden nicht überschreiben → Daten gehen nie verloren
- Der "Verlierer"-Datensatz bleibt in `sync_ops` erhalten (vollständige History)
- Bei gleichem `updated_at`: höhere `device_id` (lexikalisch) gewinnt

### 6.5 Device Discovery

- Neues Device schreibt `devices/{device_id}.json` bei erstem Sync
- Bestehende Devices listen regelmäßig `devices/` in R2
- Neues Device wird automatisch erkannt und in den Pull-Zyklus aufgenommen

## 7. Desktop-Implementierung (Python)

### 7.1 Neue Dateien

| Datei | Inhalt |
|---|---|
| `backend/finance_server/services/sync_service.py` | Push/Pull-Thread, Logik |
| `backend/finance_server/services/sync_crypto.py` | AES-GCM + PBKDF2 |
| `backend/finance_server/services/r2_client.py` | R2 (S3-API) Wrapper |
| `backend/finance_server/models/sync_models.py` | Pydantic-Modelle |

### 7.2 Bestehende Änderungen

| Datei | Änderung |
|---|---|
| `core/schema.py` | `sync_ops` + `sync_state` Tabellen DDL |
| `core/config.py` | R2-Config-Felder |
| `main.py` | Sync-Service-Start beim App-Start |

### 7.3 CRUD-Integration

Jeder DB-Schreibvorgang logged zusätzlich in `sync_ops`:

```python
def _log_sync_op(self, table: str, row_id: int, op_type: str, data: dict):
    device_id = sync_state.get("local_device_id")
    seq = sync_state.incr("last_seq")
    db.execute("INSERT INTO sync_ops (...) VALUES (...)")
```

## 8. Mobile-Implementierung (Flutter)

### 8.1 Neue Abhängigkeiten

- `sqflite` — lokale SQLite
- `flutter_secure_storage` — iOS/Android Keychain
- `cryptography` — AES-256-GCM
- `aws_s3` (oder `minio` dart) — R2 S3 API
- `pbkdf2` (oder `pointycastle`) — Key Derivation

### 8.2 Neue Dateien

| Datei | Inhalt |
|---|---|
| `lib/services/sync_service.dart` | Push/Pull-Zyklus |
| `lib/services/sync_crypto.dart` | AES-GCM + PBKDF2 |
| `lib/services/r2_client.dart` | R2 Wrapper |
| `lib/models/sync_op.dart` | Datenmodell |
| `lib/pages/sync_setup_page.dart` | Passwort + R2-Credentials Setup |

## 9. Sync-Client Konfiguration (pro Gerät)

Beim ersten Start der App (oder in den Einstellungen) müssen folgende Daten eingegeben werden:

1. **Sync-Passwort** — für die clientseitige Verschlüsselung
2. **R2 Account ID** — aus Cloudflare Dashboard
3. **R2 Access Key ID** — vom R2 API Token
4. **R2 Secret Access Key** — vom R2 API Token
5. **Bucket-Name** — `finance-sync` (Standard)

Die R2-Credentials werden **mit Fernet (dem bestehenden Backend-Mechanismus)** lokal verschlüsselt in `app_settings` gespeichert.

## 10. Sicherheit

| Aspekt | Lösung |
|---|---|
| Daten bei Cloudflare R2 | AES-256-GCM — Provider sieht nur undurchschaubare Bytes |
| Sync-Passwort | Nie gespeichert, nur PBKDF2-Key |
| Key auf Disk | OS-Keychain / Keystore |
| R2-Credentials in DB | Fernet-verschlüsselt (bestehender Mechanismus) |
| Replay-Angriff | `(device_id, seq)` unique → doppelte werden ignoriert |
| Man-in-the-Middle | R2 verwendet HTTPS + Payload ist bereits verschlüsselt |
| Key-Bruteforce | PBKDF2 mit 600k Iterationen |
| Falsches Passwort | Führt zu anderem Key → Entschlüsselung fehlschlägt → Daten bleiben sicher |
| Geräte-Kompromittierung | Lokale DB + R2-Credentials + Sync-Key liegen auf dem Gerät — Gerätesicherheit ist kritisch |
| Multi-Tenancy | Jeder Benutzer eigener R2-Bucket + API-Token |

## 11. Offene Punkte (nicht im ersten Release)

- **Key-Rotation:** Sync-Passwort ändern → alle Ops neu verschlüsseln
- **Belege (Receipts):** Große Bilddateien in R2 unter `files/` — separat später
- **Konflikt-UI:** Manuelle Konfliktauflösung im UI — YAGNI
- **ML-Modelle:** Werden nur auf Desktop trainiert; Kategorie-Zuweisungen sind normale Ops
