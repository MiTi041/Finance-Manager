import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from finance_server.api.transactions import router as transactions_router
from finance_server.api.fints import router as fints_router
from finance_server.api.bank_credentials import router as bank_credentials_router
from finance_server.api.reference_data import router as reference_data_router
from finance_server.api.categories import router as categories_router

# .env laden
BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="FinTS Server", version="1.0.0")

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

# CORS Origins aus .env
cors_origins = os.environ.get("CORS_ORIGINS", "")
allow_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins or ["*"],  # Default: erlauben alle, wenn .env fehlt
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

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}