# Mega ↔ Easy report parity tracker

Goal: Easy Cash reports match Mega Cash (filters + columns + behavior) with **no invented labels**.

## Status legend
- `filters_done` — Mega filter labels verified and wired in Easy (may omit Mega-only options with UNKNOWN semantics)
- `columns_unknown` — Mega grid headers not yet observed after عرض
- `columns_done` — Mega headers verified and Easy columns/labels aligned
- `pending` — not started

## P0 (in progress)
| Easy slug | Mega page | Filters | Columns |
|-----------|-----------|---------|---------|
| `finalreports-trialbalance` | `/FinalReports/TrialBalance.aspx` | filters_done (partial Mega-only opts pending) | columns_done (Excel 2026-09-13) + PDF formal print |
| `finalreports-generalledger` | `/FinalReports/GeneralLedger.aspx` | filters_done | columns_done (Excel 2026-09-13) + PDF formal print |
| `accountingreports-accountstatment` | `/AccountingReports/AccountStatment.aspx` | filters_done + 3 checkboxes (opening/counter/hideDetails) | columns_done + PDF print Mega-style |
| `accountingreports-customeraccountstatementbyitems` | CustomerAccountStatementByItems | filters_partial (branch/currency/customer/item) | columns_done from PDF 2026-09-13 |

## Easy current row shapes (Mega-verified where noted — do not invent labels)
- Trial Balance (from Mega Excel): `accountCode`, `accountName`, `openingDebit`, `openingCredit`, `periodDebit`, `periodCredit`, `closingDebit`, `closingCredit` — see `artifacts/mega-trial-balance/COLUMNS.md`
- General Ledger (**columns_done** via Mega Excel): `accountCode`, `accountName`, `date`, `debit`, `credit`, `balance` (daily per account + رصيد سابق/اجمالى) — `artifacts/mega-general-ledger/COLUMNS.md`
- Account Statement (**columns_done** via Mega Excel): `date`, `entryNumber`, `documentNumber`, `debit`, `credit`, `balance`, `exchangeRate`, `description` (+ رصيد سابق / اجمالي حركات الفترة) — `artifacts/mega-account-statement/COLUMNS.md`

## Blocker for full parity
Need Mega **grid headers** (screenshot after عرض with data, or Excel export file). Automation reaches filter forms and clicks عرض; result viewer (`ifViewer`) often stays blank in headless/computer-use.

## Inventory
See `artifacts/mega-easy-report-inventory.json` (~72 Easy report paths / ~76 Mega URL mappings). Next waves after P0 columns: sales, purchases, inventory, then remaining accounting/final reports.


انظر أيضاً: `artifacts/mega-what-we-need-next.md` (قائمة ما نحتاجه من ميجا للموجة التالية).
