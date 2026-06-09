# Changelog

## 1.0.0 (2026-06-06)

### Added
- Initial release: Finance Manager application
- FinTS banking integration (account sync, transactions, balance, transfers)
- Transaction management with CSV import, categories, and notes
- Reference data management (Zahlungspartner, recipient accounts, IBAN mappings)
- Dashboard with financial overview

### Changed
- Major codebase refactoring:
  - Split lib/db.ts into domain-specific modules (zahlungspartner, recipient-accounts, transactions, reference-data)
  - Split lib/categories.ts into categories/ package (api, category-tree, auto-categorize, category-transactions)
  - Split transactions.utils.ts into lib/utils/ (format, categories, accounts)
  - Split api/fints.py into fints/ package (accounts, transactions, balance, transfer, sync, product_id, client, common)
  - Split api/reference_data.py into reference_data/ package (zahlungspartner, recipient_accounts, iban_mappings)
  - Added service layer (TransactionService, CategoryService, ReferenceDataService, FinTSService)
  - Extracted sub-components from app-sidebar.tsx (BankSelector, SyncButton, SidebarFooterContent)

### Quality
- Added ESLint + Prettier configuration for frontend
- Added Ruff + Black configuration for backend
- Added EditorConfig
- Added pyproject.toml with tool config
- Added CHANGELOG and ADR documentation
