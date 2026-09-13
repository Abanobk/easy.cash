# Wave-6 Mega PDF column evidence

Source: `artifacts/mega-wave6-profits/pdf/`
Capture: `scripts/capture-mega-wave6-profits-pdfs.mjs`
Login: `KM-01_01_2022` / `test` (same as wave5)
Date range after عرض: `1/1/2022` → `3/1/2022`

Decoded from PDF render + `pdftotext -layout` + Arabic OCR of header bands.
**No invented labels.** Failed reports have no columns listed.

---

## itemsprofits → `accountingreports-itemsprofits`

Evidence: `pdf/itemsprofits.pdf` · title in PDF: `ارباح الاصناف`

### Grid headers (RTL → LTR as printed right-to-left)

1. `الصنف`
2. `مبيعات`
3. `قيمة المبيعات`
4. `مردود`
5. `قيمة المردود`
6. `صافى مبيعات`
7. `صافى قيمة المبيعات`
8. `خصومات`
9. `تكلفة مبيعات`
10. `تكلفة مردود`
11. `صافى تكلفة المبيعات`
12. `الربح`
13. `نسبة الربحية`

Note: Mega spelling uses `صافى` (ى) on this report.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، من تاريخ، الى تاريخ، نوع سعر العميل، فئة العميل / المورد، المنطقة، العميل، فرع العميل، مدير المبيعات، مندوب المبيعات، المخزن، الباركود، الفئة، فئة بديلة، الصنف، رقم التشغيلة، مسلسل الفاتورة، حالة الربح، ترتيب ب، تجميع بالفئة، عرض بوحدات القياس الافتراضية

---

## customersprofits → `accountingreports-customersprofits`

Evidence: `pdf/customersprofits.pdf` · title in PDF: `ارباح العملاء`

### Grid headers (RTL)

1. `مسلسل`
2. `المنطقة`
3. `العميل`
4. `صافي المبيعات`
5. `الارباح`
6. `نسبة الربحية`

Footer label seen: `الاجمالي`

Note: this report uses `صافي` (ي) and plural `الارباح`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، من تاريخ، الى تاريخ، فئة العميل / المورد، نوع سعر العميل، المنطقة، العميل، مدير المبيعات، مندوب المبيعات، مسلسل الفاتورة، ترتيب ب، اخفاء العملاء

---

## invoiceprofits → `accountingreports-invoiceprofits`

Evidence: `pdf/invoiceprofits.pdf` · title in PDF: `ارباح الفواتير`

### Invoice row headers (RTL)

1. `المسلسل`
2. `التاريخ`
3. `العميل`
4. `الاجمالي`
5. `الخصم`
6. `الضرائب`
7. `اضافات`
8. `الصافي`
9. `المصروفات`
10. `الربح`
11. `نسبة الربح`

### Line-detail headers under each invoice (RTL)

1. `الصنف`
2. `الكمية`
3. `الوحدة`
4. `سعر الكمية`
5. `خصومات`
6. `التكلفة`
7. `الربح`

### Footer summary labels (exact)

- `صافي مبيعات:` / `تكلفة مبيعات:` / `مصروفات مبيعات:` / `ربح مبيعات:` / `نسبة الربح:`
- `صافي مردود:` / `تكلفة مردود:` / `مصروفات مردود:` / `ربح مردود:` / `نسبة الربح:`
- `صافي الكل:` / `تكلفة الكل:` / `مصروفات الكل:` / `ربح الكل:` / `نسبة الربح:`

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، من تاريخ، الى تاريخ، المخزن، الباركود، الفئة، فئة بديلة، الصنف، نوع سعر العميل، فئة العميل / المورد، المنطقة، العميل، فرع العميل، مدير المبيعات، مندوب المبيعات، المسلسل، النوع، حالة الربح، انشأ بواسطة، اعتمد بواسطة، ترتيب ب، اخفاء التفاصيل

---

## creditsages → `accountingreports-creditsages`

**FAILED — no PDF.**

- Path: `/AccountingReports/CreditsAges.aspx`
- Result: redirected to Authorization — `الوصول مرفوض! ليس لديك صلاحيات كافية للوصول للصفحة المطلوبة`
- Screenshot: `pdf/creditsages-blocked.png`
- Filters scan note (`FILTERS-BY-REPORT.md`): فورم نحيف جداً — may be auth/error page on test login

**No column headers available from Mega PDF for this login.**

---

## creditsagesbyyear → `accountingreports-creditsagesbyyear`

**FAILED — no PDF.**

- Path: `/AccountingReports/CreditsAgesByYear.aspx`
- Result: redirected to `StartScreen.aspx` (no report chrome / no عرض)
- Screenshot: `pdf/creditsagesbyyear-blocked.png`
- Same thin-form / unavailable warning in filters scan

**No column headers available.**

---

## creditsagesbyhalfyear → `accountingreports-creditsagesbyhalfyear`

**FAILED — no PDF.**

- Path: `/AccountingReports/CreditsAgesByHalfYear.aspx`
- Result: redirected to `StartScreen.aspx`
- Screenshot: `pdf/creditsagesbyhalfyear-blocked.png`

**No column headers available.**

Related note: customer debt aging (`DebitsAges*`) was captured in wave2; vendor credits aging (`CreditsAges*`) remains blocked by permissions on `test` @ `KM-01_01_2022`.
