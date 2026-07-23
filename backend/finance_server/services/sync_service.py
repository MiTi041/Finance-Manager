from __future__ import annotations

import logging
import threading
from typing import Any

from cryptography.fernet import Fernet

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
    encrypted = _get_sync_fernet().encrypt(key).decode("utf-8")
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
