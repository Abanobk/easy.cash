# Mega P0 reports — verified filters (no invented columns)

Source: live Mega Cash (`km.mega-cash.net`, user `test`, company `KM-01_01_2022`) + screenshots under `/workspace/*-filters.webp` and capture notes from computer-use agent.

## Grid columns
**UNKNOWN** for Trial Balance, General Ledger, and Account Statement — reports need dates + عرض before headers appear; automation could not load the grid.

## Trial Balance — `/FinalReports/TrialBalance.aspx`
- الفرع، من تاريخ، الى تاريخ، الحساب الرئيسي
- طريقة تجميع العملاء، مستوى العرض، حالة النشاط، ترتيب بـ (default: كود شجرة الحسابات)، كود شجرة الحسابات
- اخفاء الارصدة الصفرية — unchecked by default (show zeros)
- Buttons: عرض، تصدير للاكسل، تفريغ

Easy applied: branch, account (main), dates, hideZeroBalances. Mega-only grouping/level/activity/sort **not** wired (semantics UNKNOWN).

## General Ledger — `/FinalReports/GeneralLedger.aspx`
- الفرع، الحساب الرئيسي، مركز التكلفة، من تاريخ، الى تاريخ

Easy applied: branch, account, costCenter, dates.

## Account Statement — `/AccountingReports/AccountStatment.aspx`
- الفرع، العملة، من/الى تاريخ، اسم الحساب
- الحساب المقابل، مركز التكلفة، نوع القيد، اعتمد بواسطة، ملاحظات
- Checkboxes: عرض حركات الرصيد الافتتاحي، عرض الحسابات المقابله، اخفاء التفاصيل

Easy applied: branch, account, costCenter, currency, dates. Counter-account / entry-type / approved-by / notes / statement checkboxes **not** wired yet.
