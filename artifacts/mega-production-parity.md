# Production order ↔ Mega Cash parity

**Reference (proven):** `artifacts/mega-wave8-production/COLUMNS.md` — PDF report `اوامر الانتاج` / filters from `FILTERS-BY-REPORT.md`.  
**Screens:** Easy `/production` ≈ Mega `ProductionOrder.aspx` + `ProductionOrdersList.aspx`.  
**Not proven:** live capture of the ASP.NET create form itself (Phase F still blocked for inventing fields).

## Matched in Easy (this pass)

| Mega evidence | Easy |
|---|---|
| المنتج التام · الباركود · الفرع · التاريخ · الكمية · وحدة القياس | Form header labels + barcode lookup |
| مخزن الاستلام · رقم التشغيلة · رقم المرجع | Form + list columns/filters |
| تكلفة المواد الخام · تكلفة التوالف · اجمالى التكلفة | Header summary + materials math (`quantity` + `scrapPercent`) |
| Materials grid: المادة الخام · الباركود · الكمية · كمية تالف · وحدة القياس · تكلفة خام · تكلفة تالف · اجمالى تكلفة | Editable scrap %; scrap qty/cost derived |
| List filters: فرع · تواريخ · مخزن الاستلام · منتج تام · رقم تشغيلة · رقم المرجع · حالة · بحث | `production.list` + list UI |
| Lifecycle معلق → معتمد → مكتمل / ملغي | Existing draft / in_progress / completed / cancelled |

## Explicitly not invented (need `ProductionOrder.aspx` screenshots)

- مصروفات block / expense lines on the order  
- قسم التسليم / partial received qty (`الكمية المستلمة`) / حالة التسليم `مستلم`  
- تاريخ الانتاج · تاريخ الانتهاء · تاريخ الاستلام on the order header  
- Serial format `Prod.N` if Mega uses a different number series  

Lifecycle stock/WIP journals already exist; do not change accounting without Mega journal evidence for those extra fields.
