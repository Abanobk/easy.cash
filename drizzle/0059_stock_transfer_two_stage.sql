-- مطابقة ميجا: تحويل بمرحلتين + حقول التحويل
ALTER TABLE `stock_transfers` MODIFY COLUMN `status` enum('draft','in_transit','confirmed','cancelled') DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD COLUMN `transferType` varchar(20) DEFAULT 'direct';
--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD COLUMN `referenceNumber` varchar(100);
--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD COLUMN `receivedAt` date;
