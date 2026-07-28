from __future__ import annotations

from pydantic import BaseModel, Field


class AllocationBucket(BaseModel):
    id: int
    bucket_type: str
    percentage: float
    recipient_account_id: int | None = None
    sender_iban: str | None = None
    is_active: bool = True
    sort_order: int = 0


class AllocationBucketUpdate(BaseModel):
    percentage: float | None = Field(default=None, ge=0, le=100)
    recipient_account_id: int | None = None
    sender_iban: str | None = None
    is_active: bool | None = None
    target_amount: float | None = None
    target_months: float | None = None


class BafoegConfig(BaseModel):
    total_debt: float = 7600
    monthly_rate: float = 267
    interest_rate: float = 2.0
    payout_date: str | None = None


class AllocationSettingsUpdate(BaseModel):
    bafoeg_enabled: bool


class SavingsPlan(BaseModel):
    id: int
    name: str
    tag: str | None = None
    target_amount: float | None = None
    target_date: str | None = None
    target_recipient_name: str | None = None
    target_recipient_iban: str | None = None
    target_recipient_bic: str | None = None
    sender_iban: str | None = None
    is_visible: bool = True


class SavingsPlanCreate(BaseModel):
    name: str
    tag: str | None = None
    target_amount: float
    target_date: str
    target_recipient_name: str | None = None
    target_recipient_iban: str | None = None
    target_recipient_bic: str | None = None
    sender_iban: str | None = None


class SavingsPlanUpdate(BaseModel):
    name: str | None = None
    tag: str | None = None
    target_amount: float | None = None
    target_date: str | None = None
    target_recipient_name: str | None = None
    target_recipient_iban: str | None = None
    target_recipient_bic: str | None = None
    sender_iban: str | None = None
    is_visible: bool | None = None


class AllocationRun(BaseModel):
    id: int
    month: str
    net_income: float
    total_allocated: float
    status: str


class AllocationRunBucket(BaseModel):
    id: int
    run_id: int
    bucket_id: int
    bucket_type: str
    target_amount: float
    transferred: float
    transferred_at: str | None
    is_completed: bool


class AllocationStatus(BaseModel):
    month: str
    net_income: float
    total_allocated: float
    remaining: float
    status: str
    buckets: list[AllocationRunBucket]
    config: list[AllocationBucket]


class AllocationHistoryEntry(BaseModel):
    id: int
    month: str
    net_income: float
    status: str
    buckets: list[AllocationRunBucket]
