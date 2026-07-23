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
