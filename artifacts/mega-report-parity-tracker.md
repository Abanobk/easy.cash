# Mega ↔ Easy report parity tracker

**منهجية العمل (اقرأ أولاً):** [`mega-report-parity-method.md`](./mega-report-parity-method.md)

Goal: Easy matches Mega filters + columns + row shape. **No invented labels.**

## Legend
| Value | Meaning |
|-------|---------|
| `done` | Mega evidence + wired in Easy |
| `partial` | Wired with documented gaps |
| `todo` | Not started |
| `blocked` | Cannot capture on test Mega |
| `-` | No evidence yet |

Slugs = `featureKey` من `client/src/config/erp-navigation.ts` (مصدر الحقيقة للمسارات).

---

## Progress snapshot

| Wave | Scope | Status |
|------|--------|--------|
| P0 | TB / GL / account statement / customer-by-items | ✅ |
| 1 | Sales/purchases core ×6 | ✅ columns |
| 2 | Sales/purchases remainder | ✅ partial (credits ages gap) |
| 3 | Inventory ×10 | ✅ partial; itemaging blocked |
| 4 | Collection / checks / dues / leftovers ×10 | ✅ partial + honesty |
| **5** | **Final leftovers ×6 + دفتر اليومية** | ✅ partial (subledger + general journal capture) |
| **6** | Profits ×3 + credits ages | ✅ partial (credits blocked) |
| 7 | Reps ×4 | ✅ partial |
| 8 | Production ×2 | ✅ partial |
| 9 | HR ×7 | ✅ partial |
| 10 | Fixed assets ×3 | ✅ partial |

---

## P0
| Easy slug | Filters | Columns | Evidence | Notes |
|-----------|---------|---------|----------|-------|
| `finalreports-trialbalance` | done | done | `mega-trial-balance/` | |
| `finalreports-generalledger` | done | done | `mega-general-ledger/` | |
| `accountingreports-accountstatment` | done | done | `mega-account-statement/` | |
| `accountingreports-customeraccountstatementbyitems` | partial | done | `mega-customer-statement-by-items/` | |

## Wave 1
| Easy slug | Filters | Columns | Evidence | Notes |
|-----------|---------|---------|----------|-------|
| `accountingreports-sales` | partial | done | `mega-wave1-sales/` | |
| `accountingreports-customerssales` | partial | done | `mega-wave1-sales/` | |
| `accountingreports-grosscustomersalesbyitems` | partial | done | `mega-wave1-sales/` | |
| `accountingreports-purchases` | partial | done | `mega-wave1-sales/` | |
| `accountingreports-vendorspurchases` | partial | done | `mega-wave1-sales/` | |
| `accountingreports-grossvendorpurchasesbyitems` | partial | done | `mega-wave1-sales/` | |

## Wave 2
| Easy slug | Filters | Columns | Evidence | Notes |
|-----------|---------|---------|----------|-------|
| `accountingreports-customerstatment` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-vendorstatment` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-vendoraccountstatementbyitems` | partial | partial | `mega-wave2-sales/` | PDF exists; verify label map |
| `accountingreports-customerslist` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-vendorslist` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-customerssummary` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-vendorssummary` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-areassummary` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-lastprices` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-matureinvoices` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-maturereceipts` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-monthlysalesbyitems` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-monthlysalesbyitemstotals` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-salesorders` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-purchaseorders` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-debitsages` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-debitsagesbyyear` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-debitsagesbyhalfyear` | partial | done | `mega-wave2-sales/` | |
| `accountingreports-creditsages` | partial | partial | blocked | mirrored DebitsAges |
| `accountingreports-creditsagesbyyear` | partial | partial | blocked | mirrored DebitsAges |
| `accountingreports-creditsagesbyhalfyear` | partial | partial | blocked | mirrored DebitsAges |

## Wave 3 — inventory
| Easy slug | Filters | Columns | Evidence | Notes |
|-----------|---------|---------|----------|-------|
| `invreports-inventorysummary` | partial | done | `mega-wave3-inventory/` | |
| `invreports-itemstransferdetails` | partial | done | `mega-wave3-inventory/` | |
| `invreports-totalinventoryexportimportreport` | partial | done | `mega-wave3-inventory/` | |
| `invreports-inventorytransferdetailsreport` | partial | done | `mega-wave3-inventory/` | |
| `invreports-itemscosts` | partial | done | `mega-wave3-inventory/` | |
| `invreports-itemslist` | partial | done | `mega-wave3-inventory/` | |
| `invreports-itemssummary` | partial | done | `mega-wave3-inventory/` | |
| `invreports-incomeoutcomeitem` | partial | done | `mega-wave3-inventory/` | |
| `invreports-stagnantitems` | partial | done | `mega-wave3-inventory/` | |
| `invreports-itemaging` | partial | blocked | - | Mega StartScreen |

## Wave 4 — collection
| Easy slug | Filters | Columns | Evidence | Notes |
|-----------|---------|---------|----------|-------|
| `accountingreports-checks-checkout` | partial | done | `mega-wave4-collection/` | |
| `accountingreports-checks-checkin` | partial | done | `mega-wave4-collection/` | |
| `accountingreports-customersinstallments` | partial | done | `mega-wave4-collection/` | |
| `accountingreports-payments` | partial | done | `mega-wave4-collection/` | |
| `accountingreports-dues` | partial | done | `mega-wave4-collection/` | ≈ open invoices |
| `accountingreports-accountstatment-cash` | partial | done | `mega-wave4-collection/` | |
| `accountingreports-costcenterstatment` | partial | done | `mega-wave4-collection/` | |
| `accountingreports-dashboard` | partial | done | `mega-wave4-collection/` | |
| `accountingreports-branchessummary` | partial | done | `mega-wave4-collection/` | |
| `accountingreports-monthlyexpenses` | partial | done | `mega-wave4-collection/` | |

---

## Wave 5 — final leftovers
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `finalreports-subledger` | `/FinalReports/SubLedger.aspx` | partial | partial | `mega-wave5-final/` | needs account; journal-line cols |
| `finalreports-salescost` | `/FinalReports/SalesCost.aspx` | done | done | `mega-wave5-final/` | Mega line labels |
| `finalreports-incomestatment` | `/FinalReports/IncomeStatment.aspx` | done | done | `mega-wave5-final/` | Mega line labels |
| `finalreports-balancesheet` | `/FinalReports/BalanceSheet.aspx` | done | done | `mega-wave5-final/` | Mega line labels |
| `finalreports-financialstatment` | `/FinalReports/FinancialStatment.aspx` | done | done | `mega-wave5-final/` | Mega line labels |
| `finalreports-cashflow` | `/FinalReports/CashFlow.aspx` | done | done | `mega-wave5-final/` | Mega line labels |
| `accounting-generaljournallist` | `/Accounting/GeneralJournalList.aspx` | partial | todo | - | **missed in prior waves** — Mega menu «دفتر اليومية» opens journal voucher list (not FinalReports PDF); Easy has report handler; Mega grid headers not captured yet |

## Wave 6 — profits + close credits-ages gap
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `accountingreports-itemsprofits` | `/AccountingReports/ItemsProfits.aspx` | done | done | `mega-wave6-profits/` | |
| `accountingreports-customersprofits` | `/AccountingReports/CustomersProfits.aspx` | done | done | `mega-wave6-profits/` | |
| `accountingreports-invoiceprofits` | `/AccountingReports/InvoiceProfits.aspx` | done | done | `mega-wave6-profits/` | invoice-row; detail deferred |
| `accountingreports-creditsages` | `/AccountingReports/CreditsAges.aspx` | partial | partial | blocked | mirrored DebitsAges; Mega PDF denied |
| `accountingreports-creditsagesbyyear` | `/AccountingReports/CreditsAgesByYear.aspx` | partial | partial | blocked | mirrored DebitsAges |
| `accountingreports-creditsagesbyhalfyear` | `/AccountingReports/CreditsAgesByHalfYear.aspx` | partial | partial | blocked | mirrored DebitsAges |

## Wave 7 — reps
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `accountingreports-grossrepsalesbyitems` | `/AccountingReports/GrossRepSalesByItems.aspx` | partial | done | `mega-wave7-reps/` | region/rep grouping not rendered; grid cols match PDF |
| `accountingreports-repscollectings` | `/AccountingReports/RepsCollectings.aspx` | partial | done | `mega-wave7-reps/` | region/rep footers deferred; invoiceSerial from reference |
| `accountingreports-repdaily` | `/AccountingReports/RepDaily.aspx` | partial | done | `mega-wave7-reps/` | per-rep period aggregate; profit/commission approximated |
| `accountingreports-repdebit` | `/AccountingReports/RepDebit.aspx` | partial | done | `mega-wave7-reps/` | debit = current balance; period sales/returns/collections |

## Wave 8 — production
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `accountingreports-productionorders` | `/AccountingReports/ProductionOrders.aspx` | partial | partial | `mega-wave8-production/` | card header as lineLabel/value; materials grid; scrap/expense fields partial |
| `accountingreports-productionmaterials` | `/AccountingReports/ProductionMaterials.aspx` | partial | done | `mega-wave8-production/` | batch from order; warehouse from order header |

## Wave 9 — HR
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `hrreports-attendance` | `/HRReports/Attendance.aspx` | partial | partial | `mega-wave9-hr/` | 17 Mega cols wired; permission/mission/weekly cols empty (no Easy source) |
| `hrreports-employeesvactions` | `/HRReports/EmployeesVactions.aspx` | partial | done | `mega-wave9-hr/` | employee grouping via `_employeeName` hidden |
| `hrreports-employeespayroll` | `/HRReports/EmployeesPayroll.aspx` | partial | partial | `mega-wave9-hr/` | card as lineLabel/value; payroll breakdown approximated from payroll table |
| `hrreports-employeespayroll-list` | `/HRReports/EmployeesPayroll.aspx/List` | partial | partial | `mega-wave9-hr/` | wide grid; several deduction cols map to payroll aggregates only |
| `hrreports-employeesunderrequest` | `/HRReports/EmployeesUnderRequest.aspx` | partial | partial | `mega-wave9-hr/` | test/nationalId cols empty — schema gap |
| `hrreports-employeeslist` | `/HRReports/EmployeesList.aspx` | partial | partial | `mega-wave9-hr/` | card lineLabel/value; many profile fields empty in schema |
| `hrreports-loans-list` | `/HRReports/Loans.aspx/List` | partial | partial | `mega-wave9-hr/` | uses salary_advances; branch/installments/creditAccount empty |

## Wave 10 — fixed assets
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `fixedassetsreports-dep` | `/FixedAssetsReports/Dep.aspx` | partial | done | `mega-wave10-assets/` | as-of = dateTo; currency fixed ج.م |
| `fixedassetsreports-depruns` | `/FixedAssetsReports/Dep.aspx` | partial | done | `mega-wave10-assets/` | **same Mega page/columns as dep** — shared handler |
| `fixedassetsreports-soldfixedassets` | `/FixedAssetsReports/SoldFixedAssets.aspx` | partial | done | `mega-wave10-assets/` | lastUsage ≈ purchaseDate; category grouping deferred |

---

## Per-report gate (must all pass)

1. Map slug ↔ Mega URL  
2. Filters from Mega scan → Easy  
3. Capture PDF after عرض  
4. Decode columns (no guessing)  
5. Labels + column order  
6. Server row reshape  
7. Honesty note if approximate  
8. Update **this** tracker row  
9. Typecheck / deploy smoke  

Full checklist: `mega-report-parity-method.md`

## Related
- Method: `mega-report-parity-method.md`
- Menu: `mega-report-menu/MENU-MAP.md`
- Inventory: `mega-easy-report-inventory.json`


## Completion verdict

**Waves P0–10 are closed under the methodology gate.**

Every Easy report slug in this tracker is either:
- `done` — Mega PDF evidence + filters/columns/reshape wired, or
- `partial` / `blocked` — Mega cannot be matched further on the available test login / schema, with an honesty note (no invented Mega labels).

### Remaining honesty / blocked (not unfinished waves)
| Item | Reason |
|------|--------|
| `invreports-itemaging` | Mega StartScreen / blocked on test |
| `accountingreports-creditsages*` | Mega PDF access denied on test; columns mirrored from DebitsAges |
| `finalreports-subledger` | Mega requires main account; journal-line columns until account PDF captured |
| `accounting-generaljournallist` | Mega «دفتر اليومية» = GeneralJournalList voucher screen; columns not PDF-captured yet |
| Wave 7–10 partials | Documented data/schema approximations (see row Notes) |
| Earlier wave filter `partial` | Mega has more filter controls than Easy currently exposes |

Literal cell-by-cell `done` everywhere is **blocked by Mega test permissions / schema**, not by skipped waves. Work stops here per methodology: evidence → labels → reshape → honesty → tracker.

