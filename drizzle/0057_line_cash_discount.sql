-- Mega Cash: خصم نسبة + خصم نقدي على سطر فاتورة الشراء/البيع
ALTER TABLE `purchase_invoice_items`
  ADD COLUMN `discountAmount` decimal(15,4) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `sales_invoice_items`
  ADD COLUMN `discountAmount` decimal(15,4) DEFAULT '0';
