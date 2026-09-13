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
| **5** | **Final leftovers ×6** | ✅ partial (subledger account capture) |
| 6 | Profits ×3 + credits ages gap ×3 | ⬜ |
| 7 | Reps ×4 | ⬜ |
| 8 | Production ×2 | ⬜ |
| 9 | HR ×7 | ⬜ |
| 10 | Fixed assets ×3 | ⬜ |

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
| `accountingreports-creditsages` | partial | todo | - | **gap** |
| `accountingreports-creditsagesbyyear` | partial | todo | - | **gap** |
| `accountingreports-creditsagesbyhalfyear` | partial | todo | - | **gap** |

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

## Wave 6 — profits + close credits-ages gap
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `accountingreports-itemsprofits` | `/AccountingReports/ItemsProfits.aspx` | todo | todo | - | |
| `accountingreports-customersprofits` | `/AccountingReports/CustomersProfits.aspx` | todo | todo | - | |
| `accountingreports-invoiceprofits` | `/AccountingReports/InvoiceProfits.aspx` | todo | todo | - | |
| `accountingreports-creditsages` | `/AccountingReports/CreditsAges.aspx` | partial | todo | - | Wave 2 gap |
| `accountingreports-creditsagesbyyear` | `/AccountingReports/CreditsAgesByYear.aspx` | partial | todo | - | |
| `accountingreports-creditsagesbyhalfyear` | `/AccountingReports/CreditsAgesByHalfYear.aspx` | partial | todo | - | |

## Wave 7 — reps
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `accountingreports-grossrepsalesbyitems` | `/AccountingReports/GrossRepSalesByItems.aspx` | todo | todo | - | |
| `accountingreports-repscollectings` | `/AccountingReports/RepsCollectings.aspx` | todo | todo | - | |
| `accountingreports-repdaily` | `/AccountingReports/RepDaily.aspx` | todo | todo | - | |
| `accountingreports-repdebit` | `/AccountingReports/RepDebit.aspx` | todo | todo | - | |

## Wave 8 — production
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `accountingreports-productionorders` | `/AccountingReports/ProductionOrders.aspx` | todo | todo | - | |
| `accountingreports-productionmaterials` | `/AccountingReports/ProductionMaterials.aspx` | todo | todo | - | |

## Wave 9 — HR
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `hrreports-attendance` | `/HRReports/Attendance.aspx` | todo | todo | - | |
| `hrreports-employeesvactions` | `/HRReports/EmployeesVactions.aspx` | todo | todo | - | |
| `hrreports-employeespayroll` | `/HRReports/EmployeesPayroll.aspx` | todo | todo | - | |
| `hrreports-employeespayroll-list` | `/HRReports/EmployeesPayroll.aspx/List` | todo | todo | - | |
| `hrreports-employeesunderrequest` | `/HRReports/EmployeesUnderRequest.aspx` | todo | todo | - | |
| `hrreports-employeeslist` | `/HRReports/EmployeesList.aspx` | todo | todo | - | |
| `hrreports-loans-list` | `/HRReports/Loans.aspx/List` | todo | todo | - | |

## Wave 10 — fixed assets
| Easy slug | Mega path | Filters | Columns | Evidence | Notes |
|-----------|-----------|---------|---------|----------|-------|
| `fixedassetsreports-dep` | `/FixedAssetsReports/Dep.aspx` | todo | todo | - | |
| `fixedassetsreports-depruns` | `/FixedAssetsReports/Dep.aspx` | todo | todo | - | same Mega page family |
| `fixedassetsreports-soldfixedassets` | `/FixedAssetsReports/SoldFixedAssets.aspx` | todo | todo | - | |

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
