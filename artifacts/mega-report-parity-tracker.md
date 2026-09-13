# Mega ↔ Easy report parity tracker

Goal: Easy Cash reports match Mega Cash (filters + columns + behavior) with **no invented labels**.

## Status legend
- `filters_done` — Mega filter labels verified and wired in Easy
- `filters_partial` — core Mega filters wired; Mega-only options deferred
- `columns_unknown` — Mega grid headers not yet observed after عرض
- `columns_done` — Mega headers verified and Easy columns/labels aligned
- `menu_aligned` — sidebar grouping matches Mega screenshots

## Menu (2026-09-13)
Full map: `artifacts/mega-report-menu/MENU-MAP.md`  
Live filters: `artifacts/mega-report-menu/mega-report-filters-scan.json`

## P0 — accounting core
| Easy slug | Filters | Columns |
|-----------|---------|---------|
| `finalreports-trialbalance` | filters_done | columns_done + PDF |
| `finalreports-generalledger` | filters_done | columns_done + PDF |
| `accountingreports-accountstatment` | filters_done | columns_done + PDF |
| `accountingreports-customeraccountstatementbyitems` | filters_partial | columns_done from PDF |

## Wave 1 — sales / purchases core (6)
| Easy slug | Status |
|-----------|--------|
| `accountingreports-sales` | columns_done (PDF) |
| `accountingreports-customerssales` | columns_done |
| `accountingreports-grosscustomersalesbyitems` | columns_done |
| `accountingreports-purchases` | columns_done |
| `accountingreports-vendorspurchases` | columns_done |
| `accountingreports-grossvendorpurchasesbyitems` | columns_done |

Evidence: `artifacts/mega-wave1-sales/`

## Wave 2 — sales/purchases remainder
Customer/vendor statement, lists, summaries, areas, last prices, mature, monthly, orders, aging — PDF + reshape.  
Evidence: `artifacts/mega-wave2-sales/`

## Wave 3 — inventory (2026-09-13)
| Easy slug | Filters | Columns |
|-----------|---------|---------|
| `invreports-inventorysummary` | filters_partial | columns_done (PDF) |
| `invreports-itemstransferdetails` | filters_partial | columns_done |
| `invreports-totalinventoryexportimportreport` | filters_partial | columns_done (line-level) |
| `invreports-inventorytransferdetailsreport` | filters_partial | columns_done |
| `invreports-itemscosts` | filters_partial | columns_done |
| `invreports-itemslist` | filters_partial | columns_done |
| `invreports-itemssummary` | filters_partial | columns_done |
| `invreports-incomeoutcomeitem` | filters_partial | columns_done |
| `invreports-stagnantitems` | filters_partial | columns_done |
| `invreports-itemaging` | filters_partial | columns_unknown (Mega StartScreen) |

Evidence: `artifacts/mega-wave3-inventory/`

## Wave 4 — collection / checks / dues / accounting leftovers (2026-09-13)
| Easy slug | Filters | Columns |
|-----------|---------|---------|
| `accountingreports-checks-checkout` | filters_partial | columns_done (PDF) |
| `accountingreports-checks-checkin` | filters_partial | columns_done (PDF) |
| `accountingreports-customersinstallments` | filters_partial | columns_done (PDF) |
| `accountingreports-payments` | filters_partial | columns_done (PDF) |
| `accountingreports-dues` | filters_partial | columns_done (PDF; data ≈ open sales invoices) |
| `accountingreports-accountstatment-cash` | filters_partial | columns_done (PDF) |
| `accountingreports-costcenterstatment` | filters_partial | columns_done (PDF) |
| `accountingreports-dashboard` | filters_partial | columns_done (PDF cash balances) |
| `accountingreports-branchessummary` | filters_partial | columns_done (PDF) |
| `accountingreports-monthlyexpenses` | filters_partial | columns_done (PDF month pivot) |

Evidence: `artifacts/mega-wave4-collection/`  
Honesty: dues approximated from open sales invoices; dashboard Mega-shaped cash balances; check bank/deposit/branch enriched when linked.

## Remaining waves
5. Final statements beyond TB/GL  
6. Profits / reps / production / HR / assets
