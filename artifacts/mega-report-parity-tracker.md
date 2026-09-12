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
| `finalreports-trialbalance` | `/FinalReports/TrialBalance.aspx` | filters_done (partial Mega-only opts pending) | columns_unknown |
| `finalreports-generalledger` | `/FinalReports/GeneralLedger.aspx` | filters_done | columns_unknown |
| `accountingreports-accountstatment` | `/AccountingReports/AccountStatment.aspx` | filters_done (partial) | columns_unknown |

## Easy current row shapes (until Mega headers confirmed — do not rename to guessed Mega labels)
- Trial Balance: `accountCode`, `accountName`, `accountType`, `openingDebit`, `openingCredit`, `periodDebit`, `periodCredit`, `closingDebit`, `closingCredit`
- GL / Account Statement (`loadPostedJournalLines`): `date`, `documentNumber`, `accountCode`, `accountName`, `description`, `costCenter`, `debit`, `credit`, `balance`

## Blocker for full parity
Need Mega **grid headers** (screenshot after عرض with data, or Excel export file). Automation reaches filter forms and clicks عرض; result viewer (`ifViewer`) often stays blank in headless/computer-use.

## Inventory
See `artifacts/mega-easy-report-inventory.json` (~72 Easy report paths / ~76 Mega URL mappings). Next waves after P0 columns: sales, purchases, inventory, then remaining accounting/final reports.
