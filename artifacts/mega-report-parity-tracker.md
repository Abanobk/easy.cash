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

Nav fix: التحصيل والسداد → **الاستحقاقات** (`accountingreports-dues`); أعمار الموردين تحت المشتريات.

## P0 — accounting core
| Easy slug | Filters | Columns |
|-----------|---------|---------|
| `finalreports-trialbalance` | filters_done (customerGrouping) | columns_done + PDF |
| `finalreports-generalledger` | filters_done | columns_done + PDF |
| `accountingreports-accountstatment` | filters_done + 3 checkboxes | columns_done + PDF |
| `accountingreports-customeraccountstatementbyitems` | filters_partial | columns_done from PDF |

## Wave 1 — sales / purchases (in progress)
| Easy slug | Filters | Columns |
|-----------|---------|---------|
| `accountingreports-sales` | filters_partial (+ item/category 2026-09-13) | columns_unknown — **need Mega Excel** |
| `accountingreports-customerssales` | filters_partial (from live scan) | columns_unknown |
| `accountingreports-grosscustomersalesbyitems` | filters_partial | columns_unknown |
| `accountingreports-purchases` | filters_partial (+ item/category) | columns_unknown |
| `accountingreports-vendorspurchases` | filters_partial | columns_unknown |
| `accountingreports-grossvendorpurchasesbyitems` | filters_partial | columns_unknown |

Details + upload ask: `artifacts/mega-wave1-sales/WAVE1.md`

## Blocker
Mega `ifViewer` blank + Excel download blocked in automation (same as P0). Need user Excel after عرض for wave-1 column labels.
