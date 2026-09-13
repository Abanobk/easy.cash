# Wave-10 Mega PDF column evidence

Source: `artifacts/mega-wave10-assets/pdf/`
Capture: `scripts/capture-mega-wave7-10-pdfs.mjs`
Login: `KM-01_01_2022` / `test`

Decoded from PDF render + `pdftotext -layout` + full-page visual read.
**No invented labels.**

---

## dep → `fixedassetsreports-dep` (also `fixedassetsreports-depruns`)

Evidence: `pdf/dep.pdf` · title: `اهلاكات الاصول في 03/01/2022` · as-of `التاريخ: 3/1/2022`

**Same Mega page** `/FixedAssetsReports/Dep.aspx` is mapped to both Easy slugs `fixedassetsreports-dep` and `fixedassetsreports-depruns` in `FILTERS-BY-REPORT.md` (identical filters/controls).

### Grid headers (RTL)

1. `الاسم`
2. `العملة`
3. `سعر الصرف`
4. `تاريخ الشراء`
5. `تاريخ التشغيل`
6. `معدل الاهلاك`
7. `قيمة الاصل`
8. `الاهلاك فى 31/12/2021` (two-line header: `الاهلاك فى` over as-of date)
9. `اهلاك الفترة`
10. `مجمع الاهلاك`
11. `القيمة بعد الاهلاك`

Grouped by asset category (e.g. `أدوات و معدات`, `أراضى`, …). Subtotal: `اجمالي الفئة`. Grand: `اجمالي الكل`. Per-asset note line seen: `تاريخ الغلق: …`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، العملة، التاريخ، الفئة، الاصل، حالة الاغلاق، حالة البيع

---

## soldfixedassets → `fixedassetsreports-soldfixedassets`

Evidence: `pdf/soldfixedassets.pdf` · title: `الاصول المباعة` · `1/1/2022` → `3/1/2022`

### Grid headers (RTL)

1. `الاسم`
2. `قيمة الاصل`
3. `اخر استخدام`
4. `تاريخ البيع`
5. `الاهلاك`
6. `سعر البيع`
7. `الربح / الخسارة`

Grouped by category (e.g. `أراضي`).

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، من تاريخ، الى تاريخ، الفئة، الاصل
