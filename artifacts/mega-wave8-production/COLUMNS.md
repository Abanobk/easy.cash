# Wave-8 Mega PDF column evidence

Source: `artifacts/mega-wave8-production/pdf/`
Capture: `scripts/capture-mega-wave7-10-pdfs.mjs`
Login: `KM-01_01_2022` / `test`
Date range after Show: `1/1/2022` → `3/1/2022`

Decoded from PDF render + `pdftotext -layout` + header-band visual read.
**No invented labels.**

---

## productionorders → `accountingreports-productionorders`

Evidence: `pdf/productionorders.pdf` · title: `اوامر الانتاج`

Card/form layout (not a single flat grid). Exact field labels seen on order card:

### Order header labels
- `المنتج التام`
- `الباركود`
- `الفرع`
- `التاريخ`
- `المسلسل`
- `رقم التشغيلة`
- `تكلفة المواد الخام`
- `تكلفة التوالف`
- `مصروفات`
- `الكمية المستلمة`
- `اجمالى التكلفة`
- `الحالة`
- `الكمية`
- `وحدة القياس`
- `مخزن الاستلام`
- `تاريخ الاستلام`
- `تاريخ الانتاج`
- `تاريخ الانتهاء`
- `تكلفة الوحدة`
- `رقم المرجع`

### Materials detail grid under each order (RTL)

1. `المادة الخام`
2. `الباركود`
3. `الكمية`
4. `كمية تالف`
5. `وحدة القياس`
6. `تكلفة خام`
7. `تكلفة تالف`
8. `اجمالى تكلفة`

Section separator seen: `التسليم`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، من تاريخ، الى تاريخ، مخزن الاستلام، باركود التام، فئة المنتج التام، فئة بديلة المنتج التام، منتج تام، رقم تشغيلة التام، تاريخ الاستلام من، تاريخ الاستلام الى، المسلسل، رقم المرجع، حالة التسليم، انشأ بواسطة، اعتمد بواسطة، ملاحظات، ترتيب ب، عرض الملاحظات، اخفاء التفاصيل

---

## productionmaterials → `accountingreports-productionmaterials`

Evidence: `pdf/productionmaterials.pdf` · title: `خامات وتوالف الانتاج`

### Grid headers (RTL)

1. `المخزن`
2. `الباركود`
3. `الصنف`
4. `رقم التشغيلة`
5. `الكمية`
6. `وحدة القياس`
7. `التكلفة`

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، من تاريخ، الى تاريخ، مخزن الخامات، باركود الخام، فئة الخام، الخامة، رقم تشغيلة الخام، باركود المنتج التام، فئة المنتج التام، منتج تام (+ remaining filters in FILTERS-BY-REPORT.md)
