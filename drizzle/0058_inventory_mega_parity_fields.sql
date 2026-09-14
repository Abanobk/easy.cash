-- مطابقة ميجا (مخازن): فئات · أصناف · تسوية · مخزن · تشغيلة
ALTER TABLE `item_categories` ADD COLUMN `showInSalesInvoices` boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `itemType` varchar(50) DEFAULT 'وحدة مخزنية';
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `altCategoryId` int;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `minPrice` decimal(15,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `maxPrice` decimal(15,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD COLUMN `oppositeAccountId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD COLUMN `costCenterId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD COLUMN `customerId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD COLUMN `referenceNumber` varchar(100);
--> statement-breakpoint
ALTER TABLE `warehouses` ADD COLUMN `employeeId` int;
--> statement-breakpoint
ALTER TABLE `item_batches` ADD COLUMN `productionDate` date;
