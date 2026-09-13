# Wave-9 — HR

## Captured
| Mega | Easy slug | Status |
|---|---|---|
| Attendance | hrreports-attendance | done (PDF columns) |
| EmployeesVations | hrreports-employeesvations | done (PDF columns) |
| EmployeesPayroll | hrreports-employeespayroll | done (detail/card field labels) |
| EmployeesPayroll/List | hrreports-employeespayroll-list | done (distinct list-grid columns) |
| EmployeesUnderRequest | hrreports-employeesunderrequest | done (headers only; empty rows) |
| EmployeesList | hrreports-employeeslist | done (card field labels) |
| Loans.aspx/List | hrreports-loans-list | done (PDF columns) |
| Loans.aspx (non-List) | — | **blocked** auth on `test` |

## Honesty
- Payroll detail vs `/List` are distinct layouts (card vs wide grid); both captured.
- EmployeesUnderRequest PDF has headers but no data rows for this period/company.
- Non-List `Loans.aspx` redirects to Authorization; use List path evidence.

Evidence: `COLUMNS.md` + `pdf/`.
