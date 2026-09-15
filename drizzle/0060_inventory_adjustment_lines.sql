-- تسوية المخزون: مطابقة ميجا كاش — مرجع/فرع/مركز تكلفة/حساب مقابل على المستند، ومخزن/دفعة/ملاحظات لكل سطر
ALTER TABLE `inventory_adjustments` ADD `reference` varchar(100);
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD `branchId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD `costCenterId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD `contraAccountId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD `journalId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `warehouseId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `batchNumber` varchar(100);
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `notes` text;
