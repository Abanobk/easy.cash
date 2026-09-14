-- عمق مستند مخزون أول المدة + سطور التسوية/التحويل (ميجا)
ALTER TABLE `beginning_inventory` ADD COLUMN `branchId` int;
--> statement-breakpoint
ALTER TABLE `beginning_inventory` ADD COLUMN `referenceNumber` varchar(100);
--> statement-breakpoint
ALTER TABLE `beginning_inventory` ADD COLUMN `notes` text;
--> statement-breakpoint
ALTER TABLE `beginning_inventory` ADD COLUMN `batchNumber` varchar(100);
--> statement-breakpoint
ALTER TABLE `beginning_inventory` ADD COLUMN `status` enum('draft','confirmed') NOT NULL DEFAULT 'confirmed';
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD COLUMN `unitCost` decimal(15,4) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD COLUMN `batchNumber` varchar(100);
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD COLUMN `productionDate` date;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD COLUMN `expiryDate` date;
--> statement-breakpoint
ALTER TABLE `stock_transfer_items` ADD COLUMN `unitCost` decimal(15,4) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `stock_transfer_items` ADD COLUMN `batchNumber` varchar(100);
