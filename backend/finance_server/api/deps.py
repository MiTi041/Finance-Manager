from __future__ import annotations

from finance_server.services.transaction_service import TransactionService
from finance_server.services.category_service import CategoryService
from finance_server.services.reference_data_service import ReferenceDataService
from finance_server.fints.service import FintsService
from finance_server.services.subscription_service import SubscriptionService
from finance_server.services.credentials_service import CredentialsService
from finance_server.services.subscription_identity_service import SubscriptionIdentityService
from finance_server.services.export_import_service import ExportImportService
from finance_server.services.receipt_service import ReceiptService


def get_transaction_service() -> TransactionService:
    return TransactionService()


def get_category_service() -> CategoryService:
    return CategoryService()


def get_reference_data_service() -> ReferenceDataService:
    return ReferenceDataService()


def get_fints_service() -> FintsService:
    return FintsService()


def get_subscription_service() -> SubscriptionService:
    return SubscriptionService()


def get_credentials_service() -> CredentialsService:
    return CredentialsService()


def get_subscription_identity_service() -> SubscriptionIdentityService:
    return SubscriptionIdentityService()


def get_export_import_service() -> ExportImportService:
    return ExportImportService()


def get_receipt_service() -> ReceiptService:
    return ReceiptService()
