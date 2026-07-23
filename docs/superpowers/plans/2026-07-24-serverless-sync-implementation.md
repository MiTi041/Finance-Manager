# Serverless Cross-Device Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encrypted serverless sync to the Desktop finance app via Cloudflare R2 + AES-256-GCM operation log.

**Architecture:** Every DB write is recorded in a `sync_ops` table. A background thread encrypts new ops (AES-256-GCM) and pushes them to Cloudflare R2 every 30s, while simultaneously pulling and applying ops from other devices. The sync key is derived from a user password via PBKDF2. R2 credentials are stored Fernet-encrypted in `app_settings`.

**Tech Stack:** Python 3.11+, FastAPI, SQLite, `cryptography` (AES-GCM + PBKDF2), `boto3` (R2 S3 API), `pytest`

**This plan covers Desktop only.** Mobile (Flutter) sync is a separate follow-up plan.

## Global Constraints

- No new external services beyond Cloudflare R2
- All sync data encrypted client-side before leaving the device
- R2 credentials stored Fernet-encrypted in `app_settings` (same mechanism as bank credentials)
- Sync key derived via PBKDF2 (600k iterations, SHA-256) — never stored in plaintext
- Sync interval: 30 seconds
- Conflict resolution: Last-Write-Wins via `updated_at`
- Code follows existing patterns: standalone functions in `db/`, thin services, `with get_connection() as connection:`
- Follow `pyproject.toml` formatting (ruff, black 100 chars, double quotes)

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `backend/finance_server/services/sync_crypto.py` | PBKDF2 key derivation, AES-256-GCM encrypt/decrypt |
| `backend/finance_server/services/r2_client.py` | Cloudflare R2 S3 wrapper (put, get, list) |
| `backend/finance_server/services/sync_service.py` | Background push/pull thread, device discovery |
| `backend/finance_server/models/sync_models.py` | Pydantic request/response models |
| `backend/finance_server/db/sync.py` | DB operations for sync_ops, sync_state, R2 config in app_settings |
| `backend/finance_server/api/sync.py` | FastAPI routes for sync setup/status/trigger |
| `backend/tests/test_sync_crypto.py` | Tests for crypto module |
| `backend/tests/conftest.py` | Test fixtures |

### Modified Files

| File | Change |
|---|---|
| `backend/pyproject.toml` | Add pytest config, dev dependencies |
| `backend/requirements.txt` | Add `boto3` |
| `backend/finance_server/core/schema.py` | Add `sync_ops` + `sync_state` tables to `initialize_database()` |
| `backend/finance_server/core/config.py` | Add R2 config fields |
| `backend/finance_server/main.py` | Start sync service on app startup, add sync router |
| `backend/finance_server/api/deps.py` | Add sync service dependency |
| `backend/finance_server/db/__init__.py` | Export sync db functions |
| `backend/finance_server/db/settings.py` | No change — `set_setting`/`get_setting` already exists for app_settings |
| `frontend/src/App.tsx` | Add sync settings route |
| `frontend/src/pages/` | New SyncSettingsPage.tsx |

---

### Task 1: Project Setup (pytest + test infrastructure)

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/requirements.txt`
- Create: `backend/tests/conftest.py`

**Interfaces:**
- Produces: `test_db` pytest fixture returning a `sqlite3.Connection` to a tempfile-based test DB with schema initialized

- [ ] **Step 1: Add test dependencies to pyproject.toml**

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]

[tool.ruff.lint.per-file-ignores]
"tests/*" = ["S101"]  # allow assert
```

- [ ] **Step 2: Add boto3 to requirements.txt**

```
boto3
```

- [ ] **Step 3: Create test conftest.py**

```python
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from finance_server.core.schema import initialize_database


@pytest.fixture
def test_db() -> sqlite3.Connection:
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    initialize_database(conn)
    yield conn
    conn.close()
    Path(db_path).unlink()
```

- [ ] **Step 4: Run test to verify it works**

Run: `cd backend && python -m pytest tests/ -v`
Expected: no tests collected (just config/import validation — exit code 0)

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/requirements.txt backend/tests/conftest.py
git commit -m "chore: add pytest setup + boto3 dependency"
```

---

### Task 2: Sync Crypto Module

**Files:**
- Create: `backend/finance_server/services/sync_crypto.py`
- Create: `backend/tests/test_sync_crypto.py`

**Interfaces:**
- Produces:
  - `derive_key(password: str) -> tuple[bytes, str]` — returns (key, key_id)
  - `encrypt_batch(ops: list[dict], key: bytes) -> bytes`
  - `decrypt_batch(payload: bytes, key: bytes) -> list[dict]`

- [ ] **Step 1: Write the sync_crypto module**

```python
from __future__ import annotations

import hashlib
import hmac
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


PBKDF2_SALT = b"finance-sync-v1"
PBKDF2_ITERATIONS = 600_000


def derive_key(password: str) -> tuple[bytes, str]:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=PBKDF2_SALT,
        iterations=PBKDF2_ITERATIONS,
    )
    key = kdf.derive(password.encode("utf-8"))
    key_id = hashlib.sha256(key).hexdigest()[:16]
    return key, key_id


def encrypt_batch(ops: list[dict], key: bytes) -> bytes:
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    plaintext = json.dumps(ops, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def decrypt_batch(payload: bytes, key: bytes) -> list[dict]:
    nonce, ciphertext = payload[:12], payload[12:]
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))
```

- [ ] **Step 2: Write tests for the crypto module**

```python
from __future__ import annotations

from finance_server.services.sync_crypto import derive_key, encrypt_batch, decrypt_batch


class TestDeriveKey:
    def test_returns_key_and_key_id(self):
        key, key_id = derive_key("test-password")
        assert len(key) == 32
        assert len(key_id) == 16
        assert key_id.isalnum()

    def test_same_password_same_key(self):
        key1, kid1 = derive_key("hello-world")
        key2, kid2 = derive_key("hello-world")
        assert key1 == key2
        assert kid1 == kid2

    def test_different_password_different_key(self):
        key1, _ = derive_key("password-a")
        key2, _ = derive_key("password-b")
        assert key1 != key2


class TestEncryptDecrypt:
    def test_roundtrip(self):
        key, _ = derive_key("test")
        ops = [{"device_id": "abc", "seq": 1, "op_type": "INSERT", "table_name": "umsaetze"}]
        payload = encrypt_batch(ops, key)
        assert isinstance(payload, bytes)
        assert len(payload) > 12
        result = decrypt_batch(payload, key)
        assert result == ops

    def test_multiple_ops(self):
        key, _ = derive_key("test")
        ops = [
            {"device_id": "a", "seq": 1, "op_type": "INSERT"},
            {"device_id": "a", "seq": 2, "op_type": "UPDATE"},
            {"device_id": "b", "seq": 1, "op_type": "INSERT"},
        ]
        payload = encrypt_batch(ops, key)
        assert decrypt_batch(payload, key) == ops

    def test_wrong_key_fails(self):
        key_a, _ = derive_key("password-a")
        key_b, _ = derive_key("password-b")
        ops = [{"device_id": "abc", "seq": 1, "op_type": "INSERT"}]
        payload = encrypt_batch(ops, key_a)
        import pytest
        from cryptography.exceptions import InvalidTag
        with pytest.raises(InvalidTag):
            decrypt_batch(payload, key_b)

    def test_tampered_payload_fails(self):
        key, _ = derive_key("test")
        ops = [{"device_id": "abc", "seq": 1, "op_type": "INSERT"}]
        payload = bytearray(encrypt_batch(ops, key))
        payload[15] ^= 0x01  # flip a bit in ciphertext
        import pytest
        from cryptography.exceptions import InvalidTag
        with pytest.raises(InvalidTag):
            decrypt_batch(bytes(payload), key)
```

- [ ] **Step 3: Run tests to verify**

Run: `cd backend && python -m pytest tests/test_sync_crypto.py -v`
Expected: 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/finance_server/services/sync_crypto.py backend/tests/test_sync_crypto.py
git commit -m "feat: sync crypto module (PBKDF2 + AES-256-GCM)"
```

---

### Task 3: R2 Client Module

**Files:**
- Create: `backend/finance_server/services/r2_client.py`
- Create: `backend/tests/test_r2_client.py`

**Interfaces:**
- Produces:
  - `R2Client(account_id, access_key_id, secret_access_key, bucket)` — constructor
  - `client.put_object(key: str, data: bytes) -> None`
  - `client.get_object(key: str) -> bytes | None`
  - `client.list_objects(prefix: str) -> list[str]`
  - `client.head_object(key: str) -> bool`

- [ ] **Step 1: Write the R2 client module**

```python
from __future__ import annotations

import logging
from typing import Any

import boto3
from botocore.config import Config as BotoConfig

logger = logging.getLogger(__name__)


class R2Client:
    def __init__(
        self,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        bucket: str,
    ) -> None:
        self.bucket = bucket
        endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=BotoConfig(signature_version="s3v4"),
        )

    def put_object(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)

    def get_object(self, key: str) -> bytes | None:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response["Body"].read()
        except self.client.exceptions.NoSuchKey:
            return None

    def list_objects(self, prefix: str) -> list[str]:
        keys: list[str] = []
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return keys

    def head_object(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except self.client.exceptions.ClientError:
            return False
```

- [ ] **Step 2: Write tests with mocked boto3**

```python
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from finance_server.services.r2_client import R2Client


@pytest.fixture
def mock_s3():
    with patch("boto3.client") as mock:
        yield mock


@pytest.fixture
def client(mock_s3) -> R2Client:
    return R2Client(
        account_id="test-account",
        access_key_id="test-key",
        secret_access_key="test-secret",
        bucket="test-bucket",
    )


class TestR2Client:
    def test_put_object(self, client, mock_s3):
        client.put_object("sync/device/000001.enc", b"encrypted-data")
        mock_s3.return_value.put_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="sync/device/000001.enc",
            Body=b"encrypted-data",
        )

    def test_get_object_found(self, client, mock_s3):
        mock_s3.return_value.get_object.return_value = {"Body": MagicMock(read=MagicMock(return_value=b"data"))}
        result = client.get_object("sync/device/000001.enc")
        assert result == b"data"

    def test_get_object_not_found(self, client, mock_s3):
        from botocore.exceptions import ClientError
        mock_s3.return_value.get_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey"}}, "get_object"
        )
        result = client.get_object("sync/device/000001.enc")
        assert result is None

    def test_list_objects(self, client, mock_s3):
        paginator_mock = MagicMock()
        paginator_mock.paginate.return_value = [
            {"Contents": [{"Key": "sync/device/000001.enc"}, {"Key": "sync/device/000002.enc"}]}
        ]
        mock_s3.return_value.get_paginator.return_value = paginator_mock
        result = client.list_objects("sync/device/")
        assert result == ["sync/device/000001.enc", "sync/device/000002.enc"]

    def test_head_object_exists(self, client, mock_s3):
        result = client.head_object("sync/key_id")
        assert result is True

    def test_head_object_not_exists(self, client, mock_s3):
        from botocore.exceptions import ClientError
        mock_s3.return_value.head_object.side_effect = ClientError(
            {"Error": {"Code": "NotFound"}}, "head_object"
        )
        result = client.head_object("sync/key_id")
        assert result is False
```

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_r2_client.py -v`
Expected: 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/finance_server/services/r2_client.py backend/tests/test_r2_client.py
git commit -m "feat: R2 client module for S3-compatible Cloudflare storage"
```

---

### Task 4: Database Schema (sync_ops + sync_state + app_settings helpers)

**Files:**
- Modify: `backend/finance_server/core/schema.py`
- Create: `backend/finance_server/db/sync.py`

**Interfaces:**
- Consumes: `get_connection()` from `core/database.py`, `set_setting` / `get_setting` from `db/settings.py`
- Produces:
  - `initialize_database()` extended to create `sync_ops` + `sync_state` tables
  - `log_sync_op(device_id, seq, table_name, row_id, op_type, data) -> int`
  - `get_pending_ops(last_id) -> list[dict]`
  - `apply_sync_op(op) -> None`
  - `get_sync_state(key) -> str | None`
  - `set_sync_state(key, value) -> None`
  - `get_sync_config() -> dict | None`
  - `save_sync_config(encrypted_key, r2_config) -> None`

- [ ] **Step 1: Add sync_ops and sync_state table creation to schema.py**

At the end of `initialize_database()`, before the seed data section:

```python
def create_sync_tables(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_ops (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT NOT NULL,
            seq         INTEGER NOT NULL,
            table_name  TEXT NOT NULL,
            row_id      INTEGER,
            op_type     TEXT NOT NULL CHECK(op_type IN ('INSERT', 'UPDATE', 'DELETE')),
            data        TEXT,
            checksum    TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_sync_ops_device_seq ON sync_ops(device_id, seq)"
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_sync_ops_id ON sync_ops(id)")

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_state (
            key   TEXT PRIMARY KEY,
            value TEXT
        )
        """
    )
```

Add `create_sync_tables(connection)` call in `initialize_database()` near the other table creation calls.

- [ ] **Step 2: Create db/sync.py with DB operations**

```python
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from finance_server.core.database import get_connection
from finance_server.db.settings import get_setting, set_setting


def get_or_create_device_id() -> str:
    device_id = get_sync_state("local_device_id")
    if device_id:
        return device_id
    device_id = str(uuid.uuid4())
    set_sync_state("local_device_id", device_id)
    return device_id


def get_next_seq() -> int:
    val = get_sync_state("last_seq")
    if val is None:
        set_sync_state("last_seq", "1")
        return 1
    next_seq = int(val) + 1
    set_sync_state("last_seq", str(next_seq))
    return next_seq


def log_sync_op(
    table_name: str,
    row_id: int | None,
    op_type: str,
    data: dict[str, Any] | None,
) -> int:
    device_id = get_or_create_device_id()
    seq = get_next_seq()
    data_json = json.dumps(data, ensure_ascii=False, default=str) if data else None
    checksum = None
    if data_json:
        import hashlib
        checksum = hashlib.sha256(data_json.encode("utf-8")).hexdigest()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO sync_ops (device_id, seq, table_name, row_id, op_type, data, checksum)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (device_id, seq, table_name, row_id, op_type, data_json, checksum),
        )
        return int(cursor.lastrowid)


def get_pending_ops(last_pushed_id: int = 0, limit: int = 100) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, device_id, seq, table_name, row_id, op_type, data, checksum, created_at
            FROM sync_ops
            WHERE id > ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (last_pushed_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


VALID_SYNC_TABLES = {"kategorien", "umsaetze", "zahlungspartner", "empfaengerkonten", "subscription_identities"}


def apply_sync_op(op: dict[str, Any]) -> bool:
    table = op["table_name"]
    row_id = op["row_id"]
    op_type = op["op_type"]
    data = json.loads(op["data"]) if op["data"] else None
    if table not in VALID_SYNC_TABLES:
        return False

    with get_connection() as connection:
        if op_type == "DELETE":
            cursor = connection.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))
            return cursor.rowcount > 0

        if not data:
            return False

        columns = [k for k in data.keys() if k != "id"]
        placeholders = [f"{k} = ?" for k in columns]
        values = [data[k] for k in columns]

        existing = connection.execute(
            f"SELECT updated_at FROM {table} WHERE id = ?", (row_id,)
        ).fetchone()

        if existing and data.get("updated_at"):
            if existing["updated_at"] and existing["updated_at"] >= data["updated_at"]:
                return False

        if existing:
            sql = f"UPDATE {table} SET {', '.join(placeholders)} WHERE id = ?"
            values.append(row_id)
            cursor = connection.execute(sql, values)
        else:
            all_columns = ["id"] + columns
            all_placeholders = ["?"] * len(all_columns)
            all_values = [row_id] + values
            sql = f"INSERT OR IGNORE INTO {table} ({', '.join(all_columns)}) VALUES ({', '.join(all_placeholders)})"
            cursor = connection.execute(sql, all_values)
        return cursor.rowcount > 0


def get_sync_state(key: str) -> str | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT value FROM sync_state WHERE key = ?", (key,)
        ).fetchone()
    return row["value"] if row else None


def set_sync_state(key: str, value: str) -> None:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
```

- [ ] **Step 3: Run test to verify schema**

Run: `cd backend && python -c "from finance_server.core.database import get_connection; conn = get_connection(); print('sync tables OK')"`
Expected: prints "sync tables OK" (schema initialized without error)

- [ ] **Step 4: Commit**

```bash
git add backend/finance_server/core/schema.py backend/finance_server/db/sync.py
git commit -m "feat: sync database schema and DB operations"
```

---

### Task 5: CRUD Sync Logging Integration

**Files:**
- Modify: all CRUD files that need sync logging
- Create: `backend/finance_server/services/sync_logger.py`

**Interfaces:**
- Consumes: `log_sync_op()` from `db/sync.py`
- Produces: `log_crud_event(table, row_id, op_type, data)` helper

**Tables to instrument:**
- `kategorien` (categories) — create, update, delete
- `umsaetze` (transactions) — update (note, category, splits), delete
- `zahlungspartner`, `empfaengerkonten` — create, update, delete
- `subscription_identities` — create, update, delete

- [ ] **Step 1: Create sync_logger service**

```python
from __future__ import annotations

from typing import Any

from finance_server.db.sync import log_sync_op


def log_crud_event(
    table_name: str,
    row_id: int | None,
    op_type: str,
    data: dict[str, Any] | None = None,
) -> None:
    log_sync_op(table_name, row_id, op_type, data)
```

- [ ] **Step 2: Add logging to category CRUD**

In `db/categories.py`, add `from finance_server.services.sync_logger import log_crud_event` and call it in:
- `create_category_record` after successful insert → log with the returned record data
- `update_category_record` after successful update → log with updated record
- `delete_category_record` after successful delete → log without data

```python
# in create_category_record, before return:
log_crud_event("kategorien", category_id, "INSERT", record)

# in update_category_record, before return:
log_crud_event("kategorien", category_id, "UPDATE", updated)

# in delete_category_record, before return:
log_crud_event("kategorien", category_id, "DELETE")
```

- [ ] **Step 3: Add logging to transaction mutations**

In `db/transactions.py`:
- `update_transaction_note` → log UPDATE
- `update_transaction_category` → log UPDATE
- `update_transaction_splits` → log UPDATE
- `update_transaction_refund_link` → log UPDATE
- `delete_transaction` → log DELETE

- [ ] **Step 4: Add logging to reference data CRUD**

In `db/references.py`:
- `create_zahlungspartner_record` → log INSERT
- `update_zahlungspartner_record` → log UPDATE
- `delete_zahlungspartner_record` → log DELETE
- `create_empfaengerkonto_record` → log INSERT
- `update_empfaengerkonto_record` → log UPDATE
- `delete_empfaengerkonto_record` → log DELETE

- [ ] **Step 5: Add logging to subscription identity CRUD**

In `db/subscription_identities.py`:
- `create_subscription_identity` → log INSERT
- `update_subscription_identity` → log UPDATE
- `delete_subscription_identity` → log DELETE

- [ ] **Step 6: Run existing app functionality to verify nothing broke**

Run: `cd backend && python -c "from finance_server.db.categories import list_categories; print(len(list_categories()))"`
Expected: works without error (sync logging is non-blocking)

- [ ] **Step 7: Commit**

```bash
git add backend/finance_server/services/sync_logger.py backend/finance_server/db/categories.py backend/finance_server/db/transactions.py backend/finance_server/db/references.py backend/finance_server/db/subscription_identities.py
git commit -m "feat: CRUD sync logging for all mutable entities"
```

---

### Task 6: Sync Service (Background Push/Pull Thread)

**Files:**
- Create: `backend/finance_server/services/sync_service.py`
- Modify: `backend/finance_server/core/config.py`
- Modify: `backend/finance_server/main.py`

**Interfaces:**
- Consumes: `R2Client`, `derive_key`/`encrypt_batch`/`decrypt_batch`, `db/sync.py` functions, `get_setting`/`set_setting` from `db/settings.py`
- Produces: `SyncService` class with `start()`/`stop()`/`status()` methods

- [ ] **Step 1: Add R2 config fields to config.py**

```python
sync_r2_account_id: str = ""
sync_r2_access_key_id: str = ""
sync_r2_secret_access_key: str = ""
sync_r2_bucket: str = "finance-sync"
```

- [ ] **Step 2: Create sync_service.py**

```python
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from typing import Any

from cryptography.fernet import Fernet

from finance_server.core.config import settings
from finance_server.core.paths import get_credentials_key_path
from finance_server.db.settings import get_setting, set_setting
from finance_server.db.sync import (
    get_or_create_device_id,
    get_pending_ops,
    apply_sync_op,
    get_sync_state,
    set_sync_state,
)
from finance_server.services.r2_client import R2Client
from finance_server.services.sync_crypto import derive_key, encrypt_batch, decrypt_batch

logger = logging.getLogger(__name__)

SYNC_INTERVAL = 30


def _get_sync_fernet() -> Fernet:
    key_path = get_credentials_key_path()
    if not key_path.exists():
        raise RuntimeError("Credentials key not found — app not initialized")
    return Fernet(key_path.read_bytes().strip())


def save_sync_key(password: str) -> str:
    key, key_id = derive_key(password)
    encrypted = _get_sync_fernet().encrypt(key)
    set_setting("sync_encrypted_key", encrypted)
    set_setting("sync_key_id", key_id)
    return key_id


def load_sync_key() -> bytes | None:
    encrypted = get_setting("sync_encrypted_key")
    if not encrypted:
        return None
    try:
        return _get_sync_fernet().decrypt(encrypted.encode("utf-8"))
    except Exception:
        logger.exception("Failed to decrypt sync key")
        return None


def save_r2_config(account_id: str, access_key_id: str, secret_access_key: str, bucket: str) -> None:
    fernet = _get_sync_fernet()
    set_setting("sync_r2_account_id", account_id)
    set_setting("sync_r2_access_key_id", fernet.encrypt(access_key_id.encode("utf-8")).decode("utf-8"))
    set_setting("sync_r2_secret_access_key", fernet.encrypt(secret_access_key.encode("utf-8")).decode("utf-8"))
    set_setting("sync_r2_bucket", bucket)


def load_r2_config() -> dict[str, str] | None:
    account_id = get_setting("sync_r2_account_id")
    enc_access_key = get_setting("sync_r2_access_key_id")
    enc_secret_key = get_setting("sync_r2_secret_access_key")
    bucket = get_setting("sync_r2_bucket")
    if not all([account_id, enc_access_key, enc_secret_key, bucket]):
        return None
    fernet = _get_sync_fernet()
    return {
        "account_id": account_id,
        "access_key_id": fernet.decrypt(enc_access_key.encode("utf-8")).decode("utf-8"),
        "secret_access_key": fernet.decrypt(enc_secret_key.encode("utf-8")).decode("utf-8"),
        "bucket": bucket,
    }


class SyncService:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._r2_client: R2Client | None = None
        self._sync_key: bytes | None = None
        self._last_pushed_id = 0
        self._remote_seqs: dict[str, int] = {}

    def is_configured(self) -> bool:
        return load_sync_key() is not None and load_r2_config() is not None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            logger.info("Sync service already running")
            return
        if not self.is_configured():
            logger.info("Sync service not configured — not starting")
            return

        config = load_r2_config()
        key = load_sync_key()
        if not config or not key:
            logger.warning("Sync config incomplete — not starting")
            return

        self._r2_client = R2Client(
            account_id=config["account_id"],
            access_key_id=config["access_key_id"],
            secret_access_key=config["secret_access_key"],
            bucket=config["bucket"],
        )
        self._sync_key = key
        self._last_pushed_id = int(get_sync_state("last_pushed_id") or "0")
        self._stop_event.clear()

        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="sync-service")
        self._thread.start()
        logger.info("Sync service started")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        logger.info("Sync service stopped")

    def status(self) -> dict[str, Any]:
        return {
            "running": self._thread is not None and self._thread.is_alive(),
            "configured": self.is_configured(),
            "key_configured": load_sync_key() is not None,
            "r2_configured": load_r2_config() is not None,
            "device_id": get_or_create_device_id(),
        }

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._push_cycle()
                self._pull_cycle()
            except Exception:
                logger.exception("Sync cycle failed")
            self._stop_event.wait(SYNC_INTERVAL)

    def _push_cycle(self) -> None:
        ops = get_pending_ops(self._last_pushed_id)
        if not ops:
            return

        encrypted = encrypt_batch(ops, self._sync_key)
        device_id = get_or_create_device_id()
        start_seq = ops[0]["seq"]
        key = f"ops/{device_id}/{start_seq:06d}.enc"
        self._r2_client.put_object(key, encrypted)
        self._last_pushed_id = ops[-1]["id"]
        set_sync_state("last_pushed_id", str(self._last_pushed_id))
        logger.info("Pushed %d ops (seq %d-%d)", len(ops), ops[0]["seq"], ops[-1]["seq"])

    def _pull_cycle(self) -> None:
        device_id = get_or_create_device_id()
        prefix = "ops/"
        all_keys = self._r2_client.list_objects(prefix)

        remote_devices = set()
        for k in all_keys:
            parts = k.split("/")
            if len(parts) >= 2:
                remote_devices.add(parts[1])

        for remote_id in remote_devices:
            if remote_id == device_id:
                continue
            last_seq = self._remote_seqs.get(remote_id, 0)
            remote_prefix = f"ops/{remote_id}/"
            keys = [k for k in all_keys if k.startswith(remote_prefix)]

            for key in sorted(keys):
                seq_str = key.split("/")[-1].split(".")[0]
                try:
                    seq = int(seq_str)
                except ValueError:
                    continue
                if seq <= last_seq:
                    continue

                data = self._r2_client.get_object(key)
                if data is None:
                    continue
                ops = decrypt_batch(data, self._sync_key)
                for op in ops:
                    apply_sync_op(op)
                self._remote_seqs[remote_id] = seq

        # persist remote seqs
        for remote_id, seq in self._remote_seqs.items():
            set_sync_state(f"remote_{remote_id}_seq", str(seq))

    def key_id(self) -> str | None:
        return get_setting("sync_key_id")
```

- [ ] **Step 3: Wire SyncService into main.py**

```python
# Add to imports:
from finance_server.services.sync_service import SyncService
from finance_server.api.sync import router as sync_router

# After app creation:
sync_service = SyncService()


@app.on_event("startup")
def start_sync_service() -> None:
    sync_service.start()


@app.on_event("shutdown")
def stop_sync_service() -> None:
    sync_service.stop()


# Add router:
app.include_router(sync_router, prefix="/api")
```

- [ ] **Step 4: Run the app to verify startup**

Run: `cd backend && python -c "from finance_server.main import app; print('app loaded OK')"`
Expected: prints "app loaded OK" (no import errors)

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/services/sync_service.py backend/finance_server/core/config.py backend/finance_server/main.py
git commit -m "feat: sync service background thread with push/pull cycles"
```

---

### Task 7: API Endpoints (Sync Setup + Status + Trigger)

**Files:**
- Create: `backend/finance_server/api/sync.py`
- Create: `backend/finance_server/models/sync_models.py`
- Modify: `backend/finance_server/api/deps.py`

**Interfaces:**
- Produces:
  - `GET /api/sync/status` — returns sync config status + device info
  - `POST /api/sync/setup` — accepts password + R2 config, saves to settings
  - `POST /api/sync/trigger` — forces an immediate sync cycle
  - `DELETE /api/sync/config` — clears sync config

- [ ] **Step 1: Create Pydantic models**

```python
from __future__ import annotations

from pydantic import BaseModel, Field


class SyncSetupRequest(BaseModel):
    password: str = Field(..., min_length=8, description="Sync-Passwort für die clientseitige Verschlüsselung")
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket: str = "finance-sync"


class SyncStatusResponse(BaseModel):
    configured: bool
    running: bool
    device_id: str
    key_id: str | None = None
    r2_bucket: str | None = None
```

- [ ] **Step 2: Create sync API routes**

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from starlette import status

from finance_server.models.sync_models import SyncSetupRequest, SyncStatusResponse
from finance_server.services.sync_service import (
    SyncService,
    save_sync_key,
    save_r2_config,
    load_r2_config,
)

router = APIRouter(tags=["sync"])


def get_sync_service() -> SyncService:
    from finance_server.main import sync_service
    return sync_service


@router.get("/sync/status", response_model=SyncStatusResponse)
def sync_status(service: SyncService = Depends(get_sync_service)) -> SyncStatusResponse:
    status = service.status()
    r2_config = load_r2_config() if status["configured"] else None
    return SyncStatusResponse(
        configured=status["configured"],
        running=status["running"],
        device_id=status["device_id"],
        key_id=service.key_id(),
        r2_bucket=r2_config["bucket"] if r2_config else None,
    )


@router.post("/sync/setup", status_code=status.HTTP_201_CREATED)
def sync_setup(
    request: SyncSetupRequest,
    service: SyncService = Depends(get_sync_service),
) -> dict[str, str]:
    if service.is_configured():
        raise HTTPException(status_code=409, detail="Sync bereits konfiguriert. Config löschen und erneut einrichten.")

    key_id = save_sync_key(request.password)
    save_r2_config(
        account_id=request.r2_account_id,
        access_key_id=request.r2_access_key_id,
        secret_access_key=request.r2_secret_access_key,
        bucket=request.r2_bucket,
    )

    service.stop()
    service.start()

    return {"status": "ok", "key_id": key_id}


@router.post("/sync/trigger")
def sync_trigger(service: SyncService = Depends(get_sync_service)) -> dict[str, str]:
    if not service.is_configured():
        raise HTTPException(status_code=400, detail="Sync nicht konfiguriert")
    service.stop()
    service.start()
    return {"status": "triggered"}


@router.delete("/sync/config")
def sync_clear_config(service: SyncService = Depends(get_sync_service)) -> dict[str, str]:
    from finance_server.core.database import get_connection
    from finance_server.db.settings import delete_setting

    service.stop()

    for key in [
        "sync_encrypted_key", "sync_key_id",
        "sync_r2_account_id", "sync_r2_access_key_id",
        "sync_r2_secret_access_key", "sync_r2_bucket",
    ]:
        delete_setting(key)

    with get_connection() as connection:
        connection.execute("DELETE FROM sync_state")
        connection.execute("DELETE FROM sync_ops")

    return {"status": "cleared"}
```

- [ ] **Step 3: Add sync router import to main.py**

Already done in Task 6 Step 3. Verify the import line exists.

- [ ] **Step 4: Run the app to test API imports**

Run: `cd backend && python -c "from finance_server.api.sync import router; print(router.routes)"`
Expected: prints list of route objects

- [ ] **Step 5: Commit**

```bash
git add backend/finance_server/api/sync.py backend/finance_server/models/sync_models.py backend/finance_server/api/deps.py
git commit -m "feat: sync setup/status/trigger API endpoints"
```

---

### Task 8: Frontend Sync Settings Page

**Files:**
- Create: `frontend/src/pages/SyncSettingsPage.tsx`
- Modify: `frontend/src/App.tsx`
- (Potentially) Create: `frontend/src/lib/api/sync.ts`

- [ ] **Step 1: Create sync API client**

```typescript
// frontend/src/lib/api/sync.ts
export interface SyncSetupRequest {
  password: string;
  r2_account_id: string;
  r2_access_key_id: string;
  r2_secret_access_key: string;
  r2_bucket: string;
}

export interface SyncStatus {
  configured: boolean;
  running: boolean;
  device_id: string;
  key_id: string | null;
  r2_bucket: string | null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await fetch("/api/sync/status");
  if (!res.ok) throw new Error("Failed to fetch sync status");
  return res.json();
}

export async function setupSync(config: SyncSetupRequest): Promise<void> {
  const res = await fetch("/api/sync/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Sync setup failed");
}

export async function triggerSync(): Promise<void> {
  const res = await fetch("/api/sync/trigger", { method: "POST" });
  if (!res.ok) throw new Error("Sync trigger failed");
}

export async function clearSync(): Promise<void> {
  const res = await fetch("/api/sync/config", { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear sync config");
}
```

- [ ] **Step 2: Create SyncSettingsPage component**

```tsx
// frontend/src/pages/SyncSettingsPage.tsx
import { useState, useEffect } from "react";
import { getSyncStatus, setupSync, triggerSync } from "@/lib/api/sync";

export default function SyncSettingsPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [password, setPassword] = useState("");
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKey, setR2AccessKey] = useState("");
  const [r2SecretKey, setR2SecretKey] = useState("");
  const [bucket, setBucket] = useState("finance-sync");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSyncStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await setupSync({ password, r2_account_id: r2AccountId, r2_access_key_id: r2AccessKey, r2_secret_access_key: r2SecretKey, r2_bucket: bucket });
      setStatus({ ...status!, configured: true, running: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  if (status?.configured) {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Sync</h1>
        <div className="rounded-lg border p-4 space-y-2">
          <p>Status: {status.running ? "Aktiv" : "Gestoppt"}</p>
          <p>Geräte-ID: <code className="text-xs">{status.device_id}</code></p>
          {status.key_id && <p>Key-ID: <code className="text-xs">{status.key_id}</code></p>}
          {status.r2_bucket && <p>Bucket: {status.r2_bucket}</p>}
        </div>
        <button onClick={() => triggerSync()} className="rounded bg-primary px-4 py-2 text-white">
          Sync jetzt ausführen
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Sync einrichten</h1>
      {error && <div className="rounded bg-red-100 p-3 text-red-700">{error}</div>}
      <form onSubmit={handleSetup} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Sync-Passwort</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full rounded border p-2" required minLength={8} />
        </div>
        <div>
          <label className="block text-sm font-medium">R2 Account ID</label>
          <input value={r2AccountId} onChange={e => setR2AccountId(e.target.value)}
            className="w-full rounded border p-2" required />
        </div>
        <div>
          <label className="block text-sm font-medium">R2 Access Key ID</label>
          <input value={r2AccessKey} onChange={e => setR2AccessKey(e.target.value)}
            className="w-full rounded border p-2" required />
        </div>
        <div>
          <label className="block text-sm font-medium">R2 Secret Access Key</label>
          <input type="password" value={r2SecretKey} onChange={e => setR2SecretKey(e.target.value)}
            className="w-full rounded border p-2" required />
        </div>
        <div>
          <label className="block text-sm font-medium">Bucket-Name</label>
          <input value={bucket} onChange={e => setBucket(e.target.value)}
            className="w-full rounded border p-2" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full rounded bg-primary px-4 py-2 text-white disabled:opacity-50">
          {loading ? "Wird eingerichtet..." : "Sync aktivieren"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add route in App.tsx**

```tsx
import SyncSettingsPage from "@/pages/SyncSettingsPage";

// In the router:
<Route path="/sync" element={<SyncSettingsPage />} />
```

- [ ] **Step 4: Add navigation link in layout sidebar**

Find the sidebar component and add:
```tsx
<NavLink to="/sync">Sync</NavLink>
```

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/SyncSettingsPage.tsx frontend/src/lib/api/sync.ts frontend/src/App.tsx
git commit -m "feat: sync settings page in frontend"
```

---

## Spec Coverage Check

| Spec Section | Covered By |
|---|---|
| 2.1 Principle (local SQLite + op log + R2 + client encryption) | Tasks 2-6 |
| 2.2 Components (Desktop architecture diagram) | Tasks 3-7 |
| 2.3 Desktop vs Mobile | Desktop = this plan; Mobile = follow-up |
| 3.1 sync_ops table | Task 4 |
| 3.2 sync_state table | Task 4 |
| 3.3 app_settings entries | Tasks 6-7 |
| 4.1 R2 Setup (CORS, API Token) | Setup documentation (one-time) |
| 4.2 R2 folder structure | Task 6 (_push_cycle + _pull_cycle) |
| 5.1 PBKDF2 key derivation | Task 2 |
| 5.2 AES-256-GCM encrypt/decrypt | Task 2 |
| 5.3 Key storage (Fernet in app_settings — simplified vs OS Keychain) | Task 6 |
| 6.1 First-time setup | Task 7 (POST /api/sync/setup) |
| 6.2 Push cycle | Task 6 |
| 6.3 Pull cycle | Task 6 |
| 6.4 Conflict resolution (LWW via updated_at) | Task 4 (`apply_sync_op`) |
| 6.5 Device discovery | Task 6 (_pull_cycle listing ops/) |
| 7.1 New files (Python) | Tasks 2-7 |
| 7.2 Existing file changes | Tasks 4-7 |
| 7.3 CRUD sync op logging | Task 5 |
| 9. Sync config per device | Task 6 (save/load functions) + Task 7 (API) |
| 10. Security matrix | Implicit throughout (encryption, Fernet storage) |
| 11. Offene Punkte | Not part of this plan (YAGNI) |
