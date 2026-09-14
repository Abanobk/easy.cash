CREATE TABLE IF NOT EXISTS `factory_daily_upload_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `uploadId` int NOT NULL,
  `itemDescription` varchar(255) NOT NULL,
  `quantity` decimal(15,3),
  `amount` decimal(15,2),
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `factory_daily_upload_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `factory_daily_upload_items_upload_idx` ON `factory_daily_upload_items` (`uploadId`);
