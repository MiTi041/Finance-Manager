# Available = max(0, target_amount - spent)

## Changes

### 1. Backend — `backend/finance_server/services/allocation_service.py`
After line 249 (`bucket["spent"] = round(row[0], 2) if row else 0.0`), add:
```python
bucket["available"] = round(max(0.0, bucket["target_amount"] - bucket["spent"]), 2)
```

### 2. Frontend types — `frontend/src/lib/allocation.ts`
After line 25 (`spent?: number;`), add:
```typescript
available?: number;
```

### 3. Frontend component — `frontend/src/pages/allocation/components/bucket-card.tsx`
Replace lines 692-696:
```tsx
<span className="text-lg font-semibold tabular-nums">
  {isInfoOnly && bucket.available != null
    ? formatAmount(bucket.available)
    : bucket.bucket_type === "bafoeg" && bucket.goal_amount != null
      ? formatAmount(bucket.goal_amount)
      : formatAmount(bucket.target_amount)}
</span>
```
