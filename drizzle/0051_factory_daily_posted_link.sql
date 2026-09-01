-- ربط بيان شغل المصنع اليومي بالمستند الرسمي اللي اتحوّل له (فاتورة شراء/بيع أو أمر إنتاج)
ALTER TABLE `factory_daily_uploads`
  ADD COLUMN `postedEntityType` varchar(30),
  ADD COLUMN `postedEntityId` int,
  ADD COLUMN `postedRef` varchar(100);
