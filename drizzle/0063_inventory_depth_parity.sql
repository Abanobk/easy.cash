-- عمق مطابقة المخازن: فلاتر عروض ميجا
ALTER TABLE `item_offers` ADD COLUMN `priceType` varchar(50);
--> statement-breakpoint
ALTER TABLE `item_offers` ADD COLUMN `branchId` int;
--> statement-breakpoint
ALTER TABLE `item_offers` ADD COLUMN `areaId` int;
--> statement-breakpoint
ALTER TABLE `item_offers` ADD COLUMN `contactCategoryId` int;
--> statement-breakpoint
ALTER TABLE `item_offers` ADD COLUMN `customerId` int;
