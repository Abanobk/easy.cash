CREATE TABLE `depreciation_run_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `runId` int NOT NULL,
  `assetId` int NOT NULL,
  `amount` decimal(15,2) DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `depreciation_run_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `app_users` ADD COLUMN `scopeBranchIds` json NULL;
--> statement-breakpoint
ALTER TABLE `app_users` ADD COLUMN `scopeWarehouseIds` json NULL;
