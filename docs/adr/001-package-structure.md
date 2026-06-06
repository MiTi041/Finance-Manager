# ADR-001: Package-by-Feature Structure

## Status
Accepted (2026-06-06)

## Context
The codebase had monolithic modules mixing multiple concerns:
- lib/db.ts contained types and CRUD for 4 entities
- lib/categories.ts mixed CRUD, auto-categorize API calls, and tree logic
- api/fints.py handled accounts, transactions, balance, transfers, sync, and state management

## Decision
Split modules by domain/feature rather than by layer:

### Frontend
- lib/kontoinhaber.ts — Kontoinhaber types + CRUD
- lib/recipient-accounts.ts — Recipient account types + CRUD
- lib/transactions.ts — Transaction upload, delete, notes
- lib/reference-data.ts — Cross-entity reference data queries
- lib/categories/ — Package with api, category-tree, auto-categorize, category-transactions

### Backend
- api/fints/ — Package with accounts, transactions, balance, transfer, sync, product_id
- api/reference_data/ — Package with kontoinhaber, recipient_accounts, iban_mappings

### Service Layer
- services/* — Business logic separated from API routing

## Consequences
- Easier to find code by feature
- Reduced merge conflicts
- Clearer dependency boundaries
- Services can be unit-tested independently
