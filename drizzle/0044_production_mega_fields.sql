ALTER TABLE `production_orders` ADD COLUMN `branchId` int NULL;
--> statement-breakpoint
ALTER TABLE `production_orders` ADD COLUMN `referenceNumber` varchar(100);
--> statement-breakpoint
ALTER TABLE `production_orders` ADD COLUMN `batchNumber` varchar(100);
--> statement-breakpoint
ALTER TABLE `production_orders` ADD COLUMN `approvedBy` int NULL;
--> statement-breakpoint
ALTER TABLE `production_orders` ADD COLUMN `approvedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `production_order_materials` ADD COLUMN `notes` text;
--> statement-breakpoint
ALTER TABLE `production_order_materials` ADD COLUMN `warehouseId` int NULL;
