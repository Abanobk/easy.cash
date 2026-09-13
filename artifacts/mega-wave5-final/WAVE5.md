# Wave-5 — final statements leftovers

Date range: short period after عرض.

## Mapped Easy slugs
| Mega PDF | Easy slug | Status |
|---|---|---|
| salescost | finalreports-salescost | done (Mega line labels) |
| incomestatment | finalreports-incomestatment | done (Mega line labels) |
| balancesheet | finalreports-balancesheet | done (Mega line labels) |
| financialstatment | finalreports-financialstatment | done (Mega line labels) |
| cashflow | finalreports-cashflow | done (Mega line labels) |
| subledger | finalreports-subledger | partial (account required; journal-line columns) |

## Honesty
- Statement reports are line/amount trees from Mega PDFs; Easy returns Mega-labeled rows from posted journals (not a pixel-perfect ASP.NET layout copy).
- **Subledger:** Mega requires selecting a main account (validation). Easy requires `accountId` the same way. Mega grid header PDF still pending autocomplete pick on test login — columns currently follow posted journal lines (`date`, `documentNumber`, `accountCode`, `accountName`, `description`, `costCenter`, `debit`, `credit`, `balance`).
- Expense detail under income statement depends on chart-of-accounts naming; Easy groups under Mega section headers where mapping exists.
- Cash flow classifies cash/bank vouchers by counterparty heuristics; Mega may use dedicated cash-flow tags.

Evidence: `COLUMNS.md` + `pdf/`.
