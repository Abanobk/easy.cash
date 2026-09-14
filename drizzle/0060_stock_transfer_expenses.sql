-- مصروفات التحويل المخزني + حساب أرباح/خسائر — مطابقة ميجا InventoryTransfer
ALTER TABLE `stock_transfers` ADD COLUMN `plAccountId` int;
--> statement-breakpoint
ALTER TABLE `stock_transfer_items` ADD COLUMN `expensePercent` decimal(8,3) DEFAULT '0';
--> statement-breakpoint
CREATE TABLE `stock_transfer_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL DEFAULT 1,
	`transferId` int NOT NULL,
	`currencyCode` varchar(10) DEFAULT 'EGP',
	`exchangeRate` decimal(15,6) DEFAULT '1',
	`amount` decimal(15,2) NOT NULL,
	`creditAccountId` int NOT NULL,
	`notes` text,
	CONSTRAINT `stock_transfer_expenses_id` PRIMARY KEY(`id`)
);
