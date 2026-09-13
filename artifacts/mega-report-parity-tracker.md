# Mega ↔ Easy report parity tracker

Goal: Easy Cash reports match Mega Cash (filters + columns + behavior) with **no invented labels**.

## Status legend
- `filters_done` — Mega filter labels verified and wired in Easy (may omit Mega-only options with UNKNOWN semantics)
- `columns_unknown` — Mega grid headers not yet observed after عرض
- `columns_done` — Mega headers verified and Easy columns/labels aligned
- `pending` — not started
- `menu_aligned` — sidebar grouping matches Mega screenshots

## Menu organization (2026-09-13)
Full Mega sidebar map + live filter scan: `artifacts/mega-report-menu/MENU-MAP.md`  
Live filter dump: `artifacts/mega-report-menu/mega-report-filters-scan.json` (~75 report forms opened)

**Nav fix applied:** under التحصيل والسداد Mega shows **الاستحقاقات** (`/AccountingReports/Dues.aspx`), not supplier aging. Easy now:
- Collection group: شيكات صادرة/واردة · اقساط عملاء · معاملات نقدية وبنكية · **الاستحقاقات** (`accountingreports-dues`, filters wired, data stub until dues entity exists)
- Supplier aging (×3) moved under **تقارير المشتريات** (mirrors customer aging under sales; matches permission-tree)

## P0 (accounting core)
| Easy slug | Mega page | Filters | Columns |
|-----------|-----------|---------|---------|
| `finalreports-trialbalance` | TrialBalance | filters_done (customerGrouping from Mega PDFs 2026-09-13) | columns_done + formal PDF + grouping rows |
| `finalreports-generalledger` | `/FinalReports/GeneralLedger.aspx` | filters_done | columns_done (Excel) + formal PDF |
| `accountingreports-accountstatment` | `/AccountingReports/AccountStatment.aspx` | filters_done + 3 checkboxes | columns_done + Mega-style PDF |
| `accountingreports-customeraccountstatementbyitems` | CustomerAccountStatementByItems | filters_partial | columns_done from PDF |

## Wave 1 — Sales (next)
Open Mega → عرض → Excel for: `sales`, `grosscustomersalesbyitems`, `customerssales`, statements/aging as needed. Filter labels already captured in scan JSON.

## Inventory
`artifacts/mega-easy-report-inventory.json` (~77 entries including `accountingreports-dues`).

See also: `artifacts/mega-what-we-need-next.md`.
