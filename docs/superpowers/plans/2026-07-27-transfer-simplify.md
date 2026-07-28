# Transfer System Vereinfachung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Rewrite the transfer backend to match finance_local's proven logic, keeping BankCredentials abstraction.

**Architecture:** Port `send_transfer` from finance_local's single-file approach into Finance's `fints/` package. Simplify `client.py` helpers (validate_transfer_result, bootstrap, tan handling). Keep allocation endpoints as thin wrappers.

**Tech Stack:** Python 3.11+, FastAPI, fints library, SQLite

---
## Task 1: Fix `fints/client.py`

**Files:**
- Modify: `backend/finance_server/fints/client.py`
- Modify: `backend/finance_server/fints/common.py` (minor)

### Step 1: Fix `validate_transfer_result` — code 9160 `decoupled=False`

**Diff:**

```python
# Line 214 — change decoupled=True to decoupled=False
if "9160" in codes:
    raise TanRequired(challenge="Erforderliche TAN fehlt.", decoupled=False)
```

### Step 2: Simplify `make_client` — use `minimal_interactive_cli_bootstrap`

**Diff:** Remove the manual `fetch_tan_mechanisms` + `selected_tan_medium` from `_run()` in `fints/transfer.py` and add `minimal_interactive_cli_bootstrap(client)` in `make_client`.

**In `client.py`, update `make_client`:**

```python
def make_client(creds: BankCredentials, from_data: bytes | None) -> FinTS3PinTanClient:
    bank = get_bank_definition(creds.bank_key)
    client = FinTS3PinTanClient(
        bank_identifier=bank.blz,
        user_id=creds.username,
        pin=creds.pin,
        server=bank.fints_url,
        product_id=resolve_product_id(),
        customer_id=creds.username,
        from_data=from_data,
    )
    minimal_interactive_cli_bootstrap(client)
    return client
```

### Step 3: Simplify state handling

Remove `get_state_file_paths()` complexity. Keep `get_state_file_paths_for_creds` as primary. Remove unused `get_state_file_paths()` (non-credential variant).

---

## Task 2: Rewrite `fints/transfer.py`

**Files:**
- Rewrite: `backend/finance_server/fints/transfer.py`

**Goal:** 1:1 port of finance_local's `send_transfer` logic, adapted for BankCredentials.

### Step 1: Rewrite `send_transfer` using finance_local pattern + BankCredentials

```python
def send_transfer(req: TransferRequest) -> dict[str, Any]:
    creds = resolve_bank_credentials(req.credentials, sender_iban=req.sender_iban or None)

    def _run(from_data: bytes | None, tan_value: str | None) -> dict[str, Any]:
        client = make_client(creds, from_data)
        with client:
            while isinstance(client.init_tan_response, NeedTANResponse):
                client.init_tan_response = resolve_tan_until_done(client, client.init_tan_response, tan_value)
                tan_value = None
            save_state(client, creds)
            accounts = [a for a in client.get_sepa_accounts() if not req.sender_iban or a.iban == req.sender_iban]
            if not accounts:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Kein passendes Absenderkonto gefunden")
            sender_account = accounts[0]
            result = client.simple_sepa_transfer(
                account=sender_account, iban=req.recipient_iban, bic=req.recipient_bic or "",
                recipient_name=req.recipient_name, amount=req.amount,
                account_name=req.sender_name,
                reason=req.reason, endtoend_id="NOTPROVIDED",
            )
            needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)
            while isinstance(result, NeedTANResponse) or needs_vop:
                if NeedVOPResponse is not None and isinstance(result, NeedVOPResponse):
                    result = client.approve_vop_response(cast(Any, result))
                    needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)
                    continue
                result = resolve_tan_until_done(client, result, tan_value)
                tan_value = None
                needs_vop = NeedVOPResponse is not None and isinstance(result, NeedVOPResponse)
            validate_transfer_result(result)
        save_state(client, creds)
        return {
            "status": "ok", "sender_iban": sender_account.iban,
            "recipient_iban": req.recipient_iban, "recipient_name": req.recipient_name,
            "amount": str(req.amount), "reason": req.reason,
        }

    return with_state_retry(creds, _run, req.tan)
```

### Step 2: Keep Sparkasse 923 monkey-patch

The import-level monkey-patch in transfer.py lines 19-29 remains unchanged.

---

## Task 3: Verify `api/allocation.py` consistency

**Files:**
- Inspect: `backend/finance_server/api/allocation.py`

Ensure `execute_transfer` and `execute_savings_plan_transfer` catch `FinTSClientError` (wrapped in `with_state_retry`). Currently they catch `Exception` generically and raise 502. The `FinTSClientError` is already caught inside `send_transfer`'s `with_state_retry`, so this is already handled. No change needed.

---

## Task 4: Test & Verify

**Steps:**
1. Run `pytest backend/tests/ -v` to ensure existing tests pass
2. Run `ruff check backend/finance_server/fints/ backend/finance_server/api/fints/` for lint
3. Manually test a transfer via the API
