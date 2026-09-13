# Wave-4 collection / checks / dues / remaining accounting

Date range: short period after عرض (capture script). Dashboard may use Mega default dates.

## Mapped Easy slugs
| Mega PDF folder | Easy slug |
|---|---|
| checks-out | accountingreports-checks-checkout |
| checks-in | accountingreports-checks-checkin |
| customers-installments | accountingreports-customersinstallments |
| payments | accountingreports-payments |
| dues | accountingreports-dues |
| account-statement-cash | accountingreports-accountstatment-cash |
| cost-center-statement | accountingreports-costcenterstatment |
| dashboard | accountingreports-dashboard |
| branches-summary | accountingreports-branchessummary |
| monthly-expenses | accountingreports-monthlyexpenses |

## Honesty
- **Dues:** Easy has no dues entity; rows approximated from open sales invoices (account=customer, Mega-shaped columns).
- **Dashboard:** Mega is cash/account balance list (name/currency/balance); Easy now returns that shape for cash-like accounts.
- **Checks:** bank/deposit account/branch enriched from `bankAccounts` + party branch when present.
- **Branches summary:** cash balance approximated as collections − disbursements in period (no opening cash-by-branch store).
- **Payments:** debit/credit accounts inferred from cash/bank account vs party (Mega twin-account columns).

Evidence: `COLUMNS.md` + `pdf/`.
