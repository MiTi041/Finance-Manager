from decimal import Decimal

from pydantic import BaseModel, Field

from finance_server.models import BankCredentials

from .common import MAX_DAYS

class AccountsRequest(BaseModel):
    credentials: BankCredentials | None = None

class TransactionsRequest(BaseModel):
    credentials: BankCredentials | None = None
    scope: str | None = None
    days: int | None = Field(default=None, ge=0, le=MAX_DAYS)
    tan: str | None = None
    iban: str | None = None

class TransferRequest(BaseModel):
    credentials: BankCredentials | None = None
    recipient_iban: str = Field(min_length=15, max_length=34)
    recipient_name: str = Field(min_length=1, max_length=70)
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=1, max_length=140)
    recipient_bic: str | None = Field(default=None, max_length=11)
    tan: str | None = None
    sender_iban: str | None = None
    sender_name: str = Field(default="Finance-Manager", description="Name des Absenders auf dem Beleg")
