# Wave-3 Mega inventory columns (PDF evidence)

Captured 2026-09-13 from live Mega (`km.mega-cash.net`, company `KM-01_01_2022`) after **عرض**, range `1/1/2022`–`3/1/2022` (or as-of `3/1/2022` for single-date reports).

Source PDFs: `artifacts/mega-wave3-inventory/pdf/*.pdf`

## جرد المخازن — `invreports-inventorysummary`
Header (RTL concat): `صافى الكمية | حجز / طلب | الكمية | الوحدة / التشغيلة | الباركود | الصنف | الفئة`  
Grouped by مخزن. No cost/value columns in this PDF.

## حركة تفصيلية للاصناف — `invreports-itemstransferdetails`
`تكلفة الوحدة الواردة | كمية صادرة | كمية واردة | تكلفة الوحدة الصادرة | رصيد قيمة | القيمة | التاريخ | رقم المستند | رقم التشغيلة | من | إلي | الرصيد`  
Per-item sections with opening qty/value.

## صادر / وارد مخزن — `invreports-totalinventoryexportimportreport`
Line-level (not warehouse totals):  
`رقم التشغيلة | من | رصيد | صادر | الباركود | التاريخ | رقم المستند | اسم الصنف | وحدة القياس | وارد | الى`

## حركة تفصيلية للمخازن — `invreports-inventorytransferdetailsreport`
`رصيد قيمة | القيمة الصادرة | القيمة الواردة | الرصيد | الكمية الصادرة | الكمية الواردة | وحدة القياس | الصنف | المخزن | نوع العملية | التاريخ`

## تكاليف / قيمة الاصناف — `invreports-itemscosts`
Grouped by مخزن:  
`السعر | الفئة | اجمالى بالسعر | الصنف | الباركود | الوحدة | الكمية | متوسط التكلفة | اجمالي التكلفة`

## قائمة الاصناف — `invreports-itemslist`
`التكلفة الافتراضية | الفئة البديلة | وحدة القياس | السعر | الفئة | خصم نسبة | خصم نقدي | مسلسل | الباركود | الصنف`

## ملخص حركة الاصناف — `invreports-itemssummary`
`رصيد قيمة | رصيد كمية | قيمة صادرة | قيمة واردة | كمية صادرة | كمية واردة | رصيد قيمة سابق | رصيد كمية سابق | الوحدة | الباركود | الصنف`

## صادر / وارد صنف — `invreports-incomeoutcomeitem`
`الكمية المتاحة | الوحدة | الباركود | الصنف | صافي مبيعات | صافي مشتريات | انتاج | مردود مبيعات | مبيعات | مردود مشتريات | مشتريات`

## الاصناف الراكدة — `invreports-stagnantitems`
`وحدة القياس | التكلفة بالمخازن | حركات انتاج | مردود بيع | حركات بيع | مردود شراء | حركات شراء | الكمية بالمخازن | الفئة | اجمالي الحركات | مسلسل | الصنف`

## اعمار الاصناف — `invreports-itemaging`
⚠️ Mega page redirects to StartScreen on test account — no PDF evidence; Easy keeps existing aging layout.
