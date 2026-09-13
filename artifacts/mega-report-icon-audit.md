# مراجعة أيقونات التقارير (رئيسي/فرعي) — 2026-09-13

المصدر: `client/src/config/erp-navigation.ts` × `artifacts/mega-report-parity-tracker.md` × `artifacts/mega-easy-report-inventory.json` × `MENU-MAP.md`.

## الأقسام الرئيسية (11) — كلها موجودة
تقارير الحسابات · المبيعات · الأرباح · المندوبين · المشتريات · التحصيل والسداد · الانتاج · شئون الموظفين · الختامية · المخازن · الأصول الثابتة

## النتيجة
| الحالة | العدد | ملاحظات |
|--------|------|---------|
| مربوط في التتبع | ~75+ slug | موجات P0–10 |
| **ناقص من التتبع سابقاً** | **1** | `accounting-generaljournallist` (دفتر اليومية) |
| تحويل لشاشات تشغيل (مش ReportHub) | 5 | قائمة عملاء/موردين/موظفين، كشف عميل/مورد بدون أصناف |
| مسارات مخازن بأسماء ودّية | 10 | aliases → `invreports-*` (كلها في التتبع) |
| blocked/honesty | عدة | أعمار دائنين، تقادم أصناف، حقول HR… |

## الناقص الوحيد الجوهري
- **دفتر اليومية** (`accounting-generaljournallist`) ظاهر تحت التقارير الختامية في Easy وMega (`/Accounting/GeneralJournalList.aspx`).
- في Mega هذه شاشة قائمة قيود أكثر من تقرير FinalReports PDF.
- كان عليه handler في Easy لكن **غير مدرج في متتبّع التطابق** وبدون تسميات/ترتيب أعمدة ميجا موثّقة.
- تم إدراجه في التتبع + labels/order مبدئية (honesty: انتظار التقاط Grid/PDF).

## ليس نسياناً (لكن اختلاف سلوك)
- `accountingreports-customerslist` → `/customers`
- `accountingreports-vendorslist` → `/suppliers`
- `hrreports-employeeslist` → `/hr/employees`
- `accountingreports-customerstatment` / `vendorstatment` → شاشة كشف حساب جهات الاتصال
- `accountingreports-dashboard` → `/reports/analytics`
- `/reports/tax` و`/reports/analytics` ليستا نسخ تقارير Mega بنفس الـfeatureKey

## المخازن
كل أيقونات تقارير المخازن العشر مربوطة (`stocktake`…`item-aging`) عبر map إلى `invreports-*` في التتبع.
