-- تتبّع الكمية المتبقية لكل بند في أمر الشراء، عشان الاستلام الجزئي يبقى مربوط بمتابعة حقيقية للأمر
ALTER TABLE `purchase_order_items`
  ADD COLUMN `convertedQuantity` decimal(15,3) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `purchase_orders`
  MODIFY COLUMN `status` enum('draft','confirmed','partial','received','cancelled') DEFAULT 'draft';
