from fastapi import APIRouter

from .accounts import router as accounts_router
from .transactions import router as transactions_router
from .balance import router as balance_router
from .transfer import router as transfer_router
from .sync import router as sync_router
from .product_id import router as product_id_router

router = APIRouter()
router.include_router(accounts_router)
router.include_router(transactions_router)
router.include_router(balance_router)
router.include_router(transfer_router)
router.include_router(sync_router)
router.include_router(product_id_router)
