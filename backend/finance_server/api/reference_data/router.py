from fastapi import APIRouter
from .zahlungspartner import router as zahlungspartner_router
from .recipient_accounts import router as recipient_accounts_router
from .iban_mappings import router as iban_mappings_router

router = APIRouter()
router.include_router(zahlungspartner_router)
router.include_router(recipient_accounts_router)
router.include_router(iban_mappings_router)
