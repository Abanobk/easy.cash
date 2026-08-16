ALTER TABLE `customers` ADD COLUMN `fax` varchar(50);
--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN `commercialRegister` varchar(100);
--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN `contactPerson` varchar(255);
--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN `paymentTermDays` int;
--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN `discountPercent` decimal(8,2) DEFAULT '0.00';
--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN `openingBalance` decimal(15,2) DEFAULT '0.00';
--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN `mapUrl` varchar(500);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `fax` varchar(50);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `commercialRegister` varchar(100);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `contactPerson` varchar(255);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `paymentTermDays` int;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `discountPercent` decimal(8,2) DEFAULT '0.00';
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `openingBalance` decimal(15,2) DEFAULT '0.00';
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `creditLimit` decimal(15,2) DEFAULT '0.00';
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `branchId` int;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `mapUrl` varchar(500);
