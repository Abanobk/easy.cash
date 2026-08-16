# ضع هنا نسخة باكب Mega Cash (قراءة فقط)

## الأمان
- انسخ ملف/مجلد الباكب من Mega إلى هذا المجلد فقط.
- **لا** تستعد الباكب على برنامج Mega الحي.
- **لا** تنقل ملفات قاعدة البيانات الحية من مجلد تثبيت Mega.

## الصيغ المدعومة حالياً
1. مجلد فيه ملفات `CSV` أو `JSON` بأسماء جداول (Customers.csv, Items.json, …)
2. ملف Easy Cash JSON بالشكل `{ "version": "…", "data": { "customers": […], … } }`

## صيغة .bak (SQL Server) غير مدعومة مباشرة
1. على جهاز اختبار منفصل (ليس سيرفر Mega الحي) استعد نسخة الباكب.
2. صدّر الجداول إلى CSV/JSON وضعها هنا.
3. شغّل الفحص ثم الاستيراد.

## أوامر
```bash
# فحص فقط
node scripts/inspect-mega-backup.mjs ./mega-kam-backup

# تفريغ kam فقط (عدّ)
DATABASE_URL=... npx tsx scripts/wipe-tenant.mjs --slug kam --dry-run

# استيراد إلى kam (مع تفريغ)
DATABASE_URL=... npx tsx scripts/import-mega-to-tenant.mjs --slug kam --file ./mega-kam-backup --wipe --confirm WIPE_KAM
```

العيّنة التجريبية موجودة في `mega-kam-backup/sample-fixture/` لاختبار المسار بدون باكب حقيقي.
