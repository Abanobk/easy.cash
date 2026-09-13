# Wave-7 Mega PDF column evidence

Source: `artifacts/mega-wave7-reps/pdf/`
Capture: `scripts/capture-mega-wave7-10-pdfs.mjs`
Login: `KM-01_01_2022` / `test`
Date range after Show: `1/1/2022` → `3/1/2022`

Decoded from PDF render + `pdftotext -layout` + header-band visual read.
**No invented labels.**

---

## grossrepsalesbyitems → `accountingreports-grossrepsalesbyitems`

Evidence: `pdf/grossrepsalesbyitems.pdf` · title: `مبيعات المندوبين بالاصناف`

### Grid headers (RTL)

1. `الصنف`
2. `الكمية`
3. `وحده القياس`
4. `سعر الوحدة`
5. `الخصم`
6. `القيمة`

Grouping: region name → rep name. Subtotal rows: `اجمالي الصنف`. Rep footer labels: `اجمالى بيع` · `عمولة بيع` · `اجمالى كمية`. Grand: `اجمالي الكل`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، العملة، من تاريخ، الى تاريخ، المخزن، الباركود، الفئة، فئة بديلة، الصنف، فئة العميل / المورد، المنطقة، العميل، مدير المبيعات، مندوب المبيعات، النوع، عرض بوحدات القياس الافتراضية

---

## repscollectings → `accountingreports-repscollectings`

Evidence: `pdf/repscollectings.pdf` · title: `تحصيلات المندوبين`

### Grid headers (RTL)

1. `م`
2. `تاريخ التحصيل`
3. `المسلسل`
4. `اسم العميل`
5. `المبلغ`
6. `مسلسل الفاتورة`

Grouping: region → rep. Footers: `اجمالي المنطقة` · `اجمالي كل المناطق`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، العملة، من تاريخ، الى تاريخ، فئة العميل / المورد، المنطقة، العميل، مدير المبيعات، مندوب المبيعات

---

## repdaily → `accountingreports-repdaily`

Evidence: `pdf/repdaily.pdf` · title: `يومية مندوب` (landscape)

### Grid headers (RTL)

1. `مسلسل`
2. `المندوب`
3. `مبيعات`
4. `مردود`
5. `صافي مبيعات`
6. `تحصيل`
7. `تحصيل شيكات`
8. `اجمالى التحصيل`
9. `المديونية`
10. `عمولة تحصيل`
11. `عمولة بيع`
12. `ارباح`
13. `نسبة الربحية`

Footer row label: `اجمالى`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، من تاريخ، الى تاريخ، فئة العميل / المورد، المنطقة، مدير المبيعات، مندوب المبيعات، ترتيب ب، اخفاء العمليات بدون مندوب، اخفاء التكلفة

---

## repdebit → `accountingreports-repdebit`

Evidence: `pdf/repdebit.pdf` · title: `مديونية مندوب`

### Grid headers (RTL)

1. `العميل`
2. `مبيعات`
3. `مردود`
4. `تحصيل`
5. `تحصيل شيكات`
6. `المديونية`

Footer row label: `اجمالى`. Banner text seen: `صلاحيات محدودة`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، من تاريخ، الى تاريخ، فئة العميل / المورد، المنطقة، العميل، مدير المبيعات، مندوب المبيعات، عرض المديونيات الصفرية
