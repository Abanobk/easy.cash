-- إصلاح: شاشة مندوبي البيع (SalesReps.tsx) كانت ترسل address/notes للـ API لكن الجدول
-- كان ينقصه العمودين — إضافتهم لمطابقة الفورم الحالي (لا حقول ميجا إضافية مُخترعة).
ALTER TABLE `sales_reps`
  ADD COLUMN `address` varchar(500) NULL,
  ADD COLUMN `notes` text NULL;
