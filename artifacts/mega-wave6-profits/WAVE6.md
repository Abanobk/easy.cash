# Wave-6 — profits + vendor credits aging

Date range: short period (`1/1/2022`–`3/1/2022`) after عرض.
Capture script: `scripts/capture-mega-wave6-profits-pdfs.mjs`
Credentials: same as wave5 (`KM-01_01_2022` / `test` / wave5 password).

## Mapped Easy slugs

| Mega PDF key | Easy slug | Mega path | Status |
|---|---|---|---|
| itemsprofits | accountingreports-itemsprofits | `/AccountingReports/ItemsProfits.aspx` | **done** — PDF + columns |
| customersprofits | accountingreports-customersprofits | `/AccountingReports/CustomersProfits.aspx` | **done** — PDF + columns |
| invoiceprofits | accountingreports-invoiceprofits | `/AccountingReports/InvoiceProfits.aspx` | **done** — PDF + columns |
| creditsages | accountingreports-creditsages | `/AccountingReports/CreditsAges.aspx` | **failed** — authorization denied |
| creditsagesbyyear | accountingreports-creditsagesbyyear | `/AccountingReports/CreditsAgesByYear.aspx` | **failed** — redirect StartScreen |
| creditsagesbyhalfyear | accountingreports-creditsagesbyhalfyear | `/AccountingReports/CreditsAgesByHalfYear.aspx` | **failed** — redirect StartScreen |

## Honesty

- Profit report columns are copied exactly from Mega PDFs (`COLUMNS.md`). Spellings differ across reports (`صافى` vs `صافي`, `الارباح` vs `الربح`, `نسبة الربحية` vs `نسبة الربح`) — keep Mega forms.
- Invoice profits is a nested invoice + line-detail layout; Easy may flatten — match labels where a column exists.
- **CreditsAges\***: test user cannot open vendor credit-aging pages (matches earlier menu scan). No invented aging bucket headers. Need a permitted Mega login before column parity.
- Filters for the three profit reports are rich (branch/dates/customer/item/rep/order-by/…). CreditsAges\* filters unavailable on this account.

Evidence: `COLUMNS.md` + `pdf/` (`wave6-pdf-capture.json`, `*.pdf`, `*-blocked.png`).
