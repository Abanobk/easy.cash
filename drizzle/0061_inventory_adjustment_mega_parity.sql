-- تسوية المخزون: إتمام مطابقة ميجا كاش — عميل واعتماد على المستند، وحدة/تكلفة/تاريخ إنتاج/صلاحية لكل سطر
ALTER TABLE `inventory_adjustments` ADD `customerId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD `approvedBy` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `unitCost` decimal(15,4) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `productionDate` date;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `expiryDate` date;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `unit` varchar(50);
