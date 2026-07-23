from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from fastapi.responses import JSONResponse

from finance_server.core.config import settings
from finance_server.services.rate_limiter import RateLimitExceeded
from finance_server.api.transactions import router as transactions_router
from finance_server.api.fints import router as fints_router
from finance_server.api.bank_credentials import router as bank_credentials_router
from finance_server.api.reference_data import router as reference_data_router
from finance_server.api.categories import router as categories_router
from finance_server.api.db_export_import import router as db_export_import_router
from finance_server.api.subscriptions import router as subscriptions_router
from finance_server.api.subscription_identities import router as subscription_identities_router
from finance_server.api.receipts import router as receipts_router
from finance_server.api.analytics import router as analytics_router
from finance_server.api.sync import router as sync_router
from finance_server.services.sync_service import SyncService

# .env laden
BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="FinTS Server", version="1.0.0")

sync_service = SyncService()


@app.on_event("startup")
def start_sync_service() -> None:
    sync_service.start()


@app.on_event("shutdown")
def stop_sync_service() -> None:
    sync_service.stop()


@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: object, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "code": "RATE_LIMITED",
            "message": f"Bitte warte {exc.retry_after} Sekunden vor der nächsten {exc.operation}-Anfrage.",
            "retry_after": exc.retry_after,
            "operation": exc.operation,
        },
        headers={"Retry-After": str(exc.retry_after)},
    )

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

# CORS Origins aus Config
allow_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router einbinden
app.include_router(fints_router, prefix="/api")
app.include_router(transactions_router, prefix="/api")
app.include_router(bank_credentials_router, prefix="/api")
app.include_router(reference_data_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(db_export_import_router, prefix="")
app.include_router(subscriptions_router, prefix="/api")
app.include_router(subscription_identities_router, prefix="/api")
app.include_router(receipts_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(sync_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
