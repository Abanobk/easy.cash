ALTER TABLE `factory_daily_uploads` ADD COLUMN `partyId` int;
--> statement-breakpoint
ALTER TABLE `factory_daily_uploads` ADD COLUMN `productItemId` int;
--> statement-breakpoint
ALTER TABLE `factory_daily_upload_items` ADD COLUMN `itemId` int;
