# Mega P0 reports — verified filters (no invented columns)

Source: live Mega Cash (`km.mega-cash.net`, user `test`, company `KM-01_01_2022`) + screenshots under `/workspace/*-filters.webp` and capture notes from computer-use agent.

## Grid columns
**UNKNOWN** for Trial Balance, General Ledger, and Account Statement.

Automation can open the filter forms, set dates (`cph_txtDateFromSrch` / `cph_txtDateToSrch` or statement `cph_txtDateFrom` / `cph_txtDateTo`), and click `cph_btnShow`, but the data grid does not appear in a scrapeable DOM (`MainIframe` stays on the filter form; `ifViewer` empty). Calendar day/month tables must not be treated as report headers.

See `artifacts/mega-p0-grid-columns.json`.

## Trial Balance — `/FinalReports/TrialBalance.aspx`
- الفرع، من تاريخ، الى تاريخ، الحساب الرئيسي
- طريقة تجميع العملاء، مستوى العرض، حالة النشاط، ترتيب بـ (default: كود شجرة الحسابات)، كود شجرة الحسابات
- اخفاء الارصدة الصفرية — unchecked by default (show zeros)
- Buttons: عرض، تصدير للاكسل، تفريغ

Easy applied: branch, account (main), dates, hideZeroBalances, displayLevel (2–7 as tree depth), activityStatus (active/inactive in period), orderBy (code/name/balance). Mega-only **طريقة تجميع العملاء** still not wired (semantics UNKNOWN).

## General Ledger — `/FinalReports/GeneralLedger.aspx`
- الفرع، الحساب الرئيسي، مركز التكلفة، من تاريخ، الى تاريخ

Easy applied: branch, account, costCenter, dates.

## Account Statement — `/AccountingReports/AccountStatment.aspx`
- الفرع، العملة، من/الى تاريخ، اسم الحساب
- الحساب المقابل، مركز التكلفة، نوع القيد، اعتمد بواسطة، ملاحظات
- Checkboxes: عرض حركات الرصيد الافتتاحي، عرض الحسابات المقابله، اخفاء التفاصيل

Easy applied: branch, account, costCenter, currency, dates. Counter-account / entry-type / approved-by / notes / statement checkboxes **not** wired yet.
