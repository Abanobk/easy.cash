-- عمق مطابقة مخازن ميجا المتبقي (فك اعتماد · فرع · سطور · باركود وحدة · مستند أول مدة · تعليقات)
ALTER TABLE `inventory_adjustments` ADD COLUMN `branchId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD COLUMN `approvedBy` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD COLUMN `unit` varchar(50);
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD COLUMN `notes` text;
--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD COLUMN `approvedBy` int;
--> statement-breakpoint
ALTER TABLE `stock_transfer_items` ADD COLUMN `unit` varchar(50);
--> statement-breakpoint
ALTER TABLE `stock_transfer_items` ADD COLUMN `notes` text;
--> statement-breakpoint
ALTER TABLE `item_extra_units` ADD COLUMN `barcode` varchar(100);
--> statement-breakpoint
ALTER TABLE `beginning_inventory` ADD COLUMN `documentNumber` varchar(50);
--> statement-breakpoint
ALTER TABLE `beginning_inventory` ADD COLUMN `createdBy` int;
--> statement-breakpoint
ALTER TABLE `beginning_inventory` ADD COLUMN `approvedBy` int;
--> statement-breakpoint
CREATE TABLE `document_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL DEFAULT 1,
	`documentType` varchar(50) NOT NULL,
	`documentId` int NOT NULL,
	`documentNumber` varchar(50),
	`body` text NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_comments_id` PRIMARY KEY(`id`)
);
