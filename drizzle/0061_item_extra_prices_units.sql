-- أسعار إضافية ووحدات إضافية للصنف — مطابقة تبويبات ميجا Items.aspx
ALTER TABLE `items` ADD COLUMN `percentDiscount` decimal(8,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `cashDiscount` decimal(15,2) DEFAULT '0';
--> statement-breakpoint
CREATE TABLE `item_extra_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL DEFAULT 1,
	`itemId` int NOT NULL,
	`priceName` varchar(100) NOT NULL,
	`currencyCode` varchar(10) DEFAULT 'EGP',
	`unit` varchar(50),
	`price` decimal(15,2) NOT NULL DEFAULT '0',
	`percentDiscount` decimal(8,2) DEFAULT '0',
	`cashDiscount` decimal(15,2) DEFAULT '0',
	CONSTRAINT `item_extra_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_extra_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL DEFAULT 1,
	`itemId` int NOT NULL,
	`unit` varchar(50) NOT NULL,
	`factorToBase` decimal(15,6) NOT NULL DEFAULT '1',
	`priceFactor` decimal(15,6) DEFAULT '1',
	CONSTRAINT `item_extra_units_id` PRIMARY KEY(`id`)
);
