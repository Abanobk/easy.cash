-- موجة 1: حقول مطابقة ميجا لتقارير البيع/الشراء
-- البيع: اضافات | الشراء: رقم المرجع
ALTER TABLE `sales_invoices` ADD COLUMN `additions` decimal(15,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD COLUMN `referenceNumber` varchar(100);
