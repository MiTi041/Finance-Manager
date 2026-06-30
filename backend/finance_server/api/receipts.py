from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from fastapi.responses import FileResponse

from finance_server.db.transactions import update_transaction_splits
from finance_server.services.receipt_service import ReceiptService
from finance_server.api.deps import get_receipt_service

router = APIRouter()

RECEIPT_DIR = Path(__file__).resolve().parents[1] / "assets" / "receipts"


def _ensure_receipt_dir() -> None:
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)


ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".bmp", ".tiff"}


@router.post("/db/transactions/{transaction_id}/receipts")
def upload_receipt(
    transaction_id: int,
    file: UploadFile = File(...),
    service: ReceiptService = Depends(get_receipt_service),
) -> dict[str, Any]:
    _ensure_receipt_dir()

    ext = Path(file.filename or "upload.jpg").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Dateiformat {ext} nicht erlaubt. Erlaubt: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    dest = RECEIPT_DIR / f"{transaction_id}_{file.filename or 'receipt'}"
    dest = dest.resolve()
    if not str(dest).startswith(str(RECEIPT_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Ungültiger Dateipfad")

    try:
        with dest.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except OSError as err:
        raise HTTPException(status_code=500, detail=f"Datei konnte nicht gespeichert werden: {err}")

    try:
        receipt = service.process_receipt(
            umsatz_id=transaction_id,
            image_path=str(dest),
            image_filename=file.filename or "receipt",
        )
    except ValueError as err:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"OCR-Fehler: {err}")

    return {"receipt": receipt}


@router.get("/db/transactions/{transaction_id}/receipts")
def list_receipts(
    transaction_id: int,
    service: ReceiptService = Depends(get_receipt_service),
) -> dict[str, Any]:
    receipts = service.get_receipts_for_transaction(transaction_id)
    return {"receipts": receipts}


@router.get("/db/receipts/{receipt_id}")
def get_receipt(
    receipt_id: int,
    service: ReceiptService = Depends(get_receipt_service),
) -> dict[str, Any]:
    receipt = service.get_receipt(receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Beleg nicht gefunden")
    return {"receipt": receipt}


@router.get("/db/receipts/{receipt_id}/image")
def get_receipt_image(
    receipt_id: int,
    service: ReceiptService = Depends(get_receipt_service),
) -> FileResponse:
    receipt = service.get_receipt(receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Beleg nicht gefunden")

    img_path = receipt.get("image_path")
    if not img_path or not Path(img_path).exists():
        raise HTTPException(status_code=404, detail="Bild nicht gefunden")

    return FileResponse(img_path)


@router.post("/db/receipts/{receipt_id}/apply-splits")
def apply_receipt_splits(
    receipt_id: int,
    service: ReceiptService = Depends(get_receipt_service),
) -> dict[str, Any]:
    try:
        receipt = service.get_receipt(receipt_id)
        if not receipt:
            raise HTTPException(status_code=404, detail="Beleg nicht gefunden")
        items = (receipt.get("extracted_data") or {}).get("items", [])
        if not items:
            raise HTTPException(status_code=400, detail="Keine Artikel auf diesem Beleg")
        splits = service.set_splits_from_items(receipt_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    return {"splits": splits, "items": items}


@router.delete("/db/receipts/{receipt_id}")
def remove_receipt(
    receipt_id: int,
    service: ReceiptService = Depends(get_receipt_service),
) -> dict[str, Any]:
    deleted = service.delete_receipt(receipt_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Beleg nicht gefunden")
    return {"deleted": True}


@router.delete("/db/transactions/{transaction_id}/receipts")
def remove_all_receipts(
    transaction_id: int,
    service: ReceiptService = Depends(get_receipt_service),
) -> dict[str, Any]:
    deleted = service.delete_receipts_for_transaction(transaction_id)
    return {"deleted": deleted}
