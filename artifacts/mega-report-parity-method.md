# منهجية مطابقة تقارير Mega → Easy (لا تخطّي / لا اختراع)

مرجع سلوكي واحد: **Mega Cash**. Easy يطابق الفلاتر + الأعمدة + شكل الصفوف — بدون اختراع تسميات.

## قاعدة ذهبية لكل تقرير

لا يُعتبر التقرير «منتهياً» إلا إذا تحقّق **الثلاثة**:

1. **Evidence** — PDF (أو Excel) من Mega بعد زر **عرض** محفوظ تحت `artifacts/mega-waveN-…/`
2. **Columns** — العناوين منسوخة حرفياً في `COLUMNS.md` ثم مُدخلة في `client/src/config/report-column-labels.ts` (أو شاشة المخازن للمخازن)
3. **Rows + Filters** — السيرفر يعيد مفاتيح الأعمدة نفسها + الفلاتر من مسح Mega في `client/src/config/report-filter-config.ts` / ReportHub

أي تقريب بيانات يُكتب صراحة في `WAVE*.md` تحت **Honesty** وفي صف المتتبع.

---

## دورة عمل تقرير واحد (checklist)

انسخ البلوك ده لكل slug قبل ما تقفل عليه:

```
[ ] 1. Map     — featureKey ↔ Mega URL موجود في mega-easy-report-inventory.json
[ ] 2. Filters — فلاتر Mega موثّقة (FILTERS-BY-REPORT أو scan JSON) ومربوطة في Easy
[ ] 3. Capture — سكربت PDF/Excel بعد عرض، فترة قصيرة؛ المجلد artifacts/mega-waveN-…/pdf/
[ ] 4. Decode  — COLUMNS.md من نص PDF فقط (ممنوع تخمين عمود)
[ ] 5. Labels  — MEGA_REPORT_COLUMN_LABELS[slug] + ترتيب أعمدة في ReportHub
[ ] 6. Reshape — server/*-reports.ts يرجّع نفس المفاتيح والترتيب
[ ] 7. Honesty — لو تقريب: سطر في WAVE.md + عمود Notes في المتتبع
[ ] 8. Tracker — تحديث صف الـ slug: filters_* / columns_* / evidence path
[ ] 9. Verify  — tsc؛ بعد الدمج: deploy + hard refresh على تقرير واحد حي
```

### ممنوع

- إكمال أعمدة «من المنطق المحاسبي العام» بدون PDF Mega
- تعليم `columns_done` بدون ملف evidence
- إظهار اسم/شعار Mega في واجهة Easy
- قفل الموجة وفيها slug بحالة `columns_unknown` بدون قرار صريح (defer / blocked)

---

## حالات المتتبع (أعمدة ثابتة)

| الحقل | القيم |
|--------|--------|
| `filters` | `todo` · `partial` · `done` |
| `columns` | `todo` · `partial` · `done` · `blocked` |
| `evidence` | مسار المجلد أو `-` |
| `honesty` | فراغ أو جملة تقريب واحدة |

`done` للأعمدة = PDF + labels + reshape.  
`partial` = evidence موجود لكن فجوات معروفة.  
`blocked` = Mega ما بيطلعش نتيجة على حساب الاختبار (مثال: item aging).

---

## ترتيب الموجات (لا تقفز بدون سبب)

| Wave | النطاق | حالة عامة |
|------|--------|-----------|
| P0 | ميزان / أستاذ / كشف حساب / عميل بالأصناف | ✅ شبه مكتمل |
| 1 | بيع/شراء أساسي (6) | ✅ columns_done |
| 2 | باقي مبيعات/مشتريات | ✅ partial→done مع فجوات موثّقة |
| 3 | مخازن | ✅ partial؛ itemaging blocked |
| 4 | تحصيل/شيكات/استحقاقات/بقايا حسابات | ✅ partial + honesty |
| **5** | **ختامي متبقي** (تكلفة مبيعات، دخل، ميزانية، مركز مالي، تدفقات، أستاذ مساعد، …) | ⬜ التالي |
| **6** | أعمار موردين إن ناقصة + أرباح | ⬜ |
| **7** | مندوبين | ⬜ |
| **8** | إنتاج | ⬜ |
| **9** | موارد بشرية | ⬜ |
| **10** | أصول ثابتة | ⬜ |

قاعدة: **موجة واحدة في البرانش**؛ متتبع محدّث قبل ما تبدأ اللي بعدها.

---

## سكربتات capture (نمط موحّد)

1. انسخ أقرب `scripts/capture-mega-waveN-*.mjs`
2. قائمة `REPORTS = [{ megaPath, folder, easySlug }]`
3. Login Mega → تقرير → تواريخ قصيرة → عرض → PDF
4. اكتب `pdf/<folder>/` + حدّث `WAVE.md` و `COLUMNS.md`
5. نفّذ دورة الـ 9 خطوات أعلاه

فلاتر حية مسبقاً: `artifacts/mega-report-menu/` — لا تعيد مسح القائمة إلا لو Mega تغيّر.

---

## تعريف «الموجة خلصت»

- كل slug في جدول الموجة: `columns` ∈ {`done`,`blocked`} مع evidence أو سبب block
- لا يوجد `todo` صامت
- Honesty مكتوب لكل تقريب
- Commit واحد على الأقل: evidence + code + تحديث `mega-report-parity-tracker.md`

---

## مرجع سريع للملفات

| غرض | ملف |
|------|------|
| متتبع كل الـ slugs | `artifacts/mega-report-parity-tracker.md` |
| خريطة قائمة | `artifacts/mega-report-menu/MENU-MAP.md` |
| فلاتر حية | `artifacts/mega-report-menu/FILTERS-BY-REPORT.md` |
| Inventory | `artifacts/mega-easy-report-inventory.json` |
| Labels | `client/src/config/report-column-labels.ts` |
| Filters UI | `client/src/config/report-filter-config.ts` |
| Hub ترتيب | `client/src/pages/reports/shared/ReportHub.tsx` |
| Nav slugs | `client/src/config/erp-navigation.ts` |
| قاعدة Cursor | `.cursor/rules/mega-cash-reference.mdc` |
| المتتبع | `artifacts/mega-report-parity-tracker.md` |
