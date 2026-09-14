-- ضريبة 2/3 + أقل كمية/مكان لكل مخزن على بطاقة الصنف
ALTER TABLE `items` ADD COLUMN `taxRate2` decimal(5,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `taxRate3` decimal(5,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `taxId` int;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `tax2Id` int;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `tax3Id` int;
--> statement-breakpoint
ALTER TABLE `item_warehouse_stock` ADD COLUMN `minQuantity` decimal(15,3) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `item_warehouse_stock` ADD COLUMN `location` varchar(255);
