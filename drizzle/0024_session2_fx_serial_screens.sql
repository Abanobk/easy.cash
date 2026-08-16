ALTER TABLE `sales_invoices` ADD COLUMN `currencyCode` varchar(10) DEFAULT 'EGP';
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD COLUMN `exchangeRate` decimal(15,6) DEFAULT '1';
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD COLUMN `foreignTotal` decimal(15,2) NULL;
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD COLUMN `currencyCode` varchar(10) DEFAULT 'EGP';
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD COLUMN `exchangeRate` decimal(15,6) DEFAULT '1';
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD COLUMN `foreignTotal` decimal(15,2) NULL;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `trackSerial` boolean DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `item_serials` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `itemId` int NOT NULL,
  `serialNumber` varchar(100) NOT NULL,
  `warehouseId` int,
  `status` enum('in_stock','sold','returned') NOT NULL DEFAULT 'in_stock',
  `purchaseInvoiceId` int,
  `salesInvoiceId` int,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `item_serials_id` PRIMARY KEY(`id`),
  CONSTRAINT `item_serials_unique` UNIQUE(`tenantId`,`serialNumber`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tenant_screen_permissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL,
  `role` enum('admin','user','accountant','sales_rep','warehouse_manager') NOT NULL,
  `featureKey` varchar(128) NOT NULL,
  `canView` boolean NOT NULL DEFAULT true,
  `canCreate` boolean NOT NULL DEFAULT false,
  `canEdit` boolean NOT NULL DEFAULT false,
  `canDelete` boolean NOT NULL DEFAULT false,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tenant_screen_permissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `tenant_screen_permissions_unique` UNIQUE(`tenantId`,`role`,`featureKey`)
);
