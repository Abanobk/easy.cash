CREATE TABLE IF NOT EXISTS `item_bom_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `productId` int NOT NULL,
  `materialItemId` int NOT NULL,
  `quantityPerUnit` decimal(15,6) NOT NULL,
  `scrapPercent` decimal(5,2) DEFAULT '0',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `item_bom_lines_id` PRIMARY KEY(`id`),
  CONSTRAINT `item_bom_lines_unique` UNIQUE(`tenantId`,`productId`,`materialItemId`)
);
--> statement-breakpoint
ALTER TABLE `production_order_materials` ADD COLUMN `scrapPercent` decimal(5,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `production_orders` ADD COLUMN `wipJournalId` int NULL;
--> statement-breakpoint
ALTER TABLE `production_orders` ADD COLUMN `completionJournalId` int NULL;
--> statement-breakpoint
ALTER TABLE `production_orders` ADD COLUMN `wipCostAmount` decimal(15,2) DEFAULT '0';
