from typing import Any

from fastapi import APIRouter

from finance_server.models.fints import ProductIdRequest
from finance_server.fints.client import get_product_id, set_product_id

router = APIRouter()


@router.put("/product-id")
def update_product_id(request: ProductIdRequest) -> dict[str, Any]:
    set_product_id(request.product_id)
    return {"status": "ok"}


@router.get("/product-id")
def get_product_id_status() -> dict[str, Any]:
    pid = get_product_id()
    return {"configured": bool(pid), "product_id": pid}


@router.delete("/product-id")
def delete_product_id() -> dict[str, Any]:
    set_product_id(None)
    return {"status": "ok"}
