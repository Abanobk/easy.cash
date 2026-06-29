CREATE TABLE `company_profile` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'شركتي',
	`nameEn` varchar(255),
	`logo` text,
	`address` text,
	`city` varchar(100),
	`country` varchar(100) DEFAULT 'مصر',
	`phone` varchar(50),
	`phone2` varchar(50),
	`email` varchar(255),
	`website` varchar(255),
	`taxNumber` varchar(100),
	`commercialRegister` varchar(100),
	`currency` varchar(10) DEFAULT 'EGP',
	`invoiceFooter` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_profile_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `discount_coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`description` text,
	`discountType` enum('percentage','fixed') NOT NULL DEFAULT 'percentage',
	`discountValue` decimal(10,2) NOT NULL,
	`maxUses` int DEFAULT null,
	`usedCount` int NOT NULL DEFAULT 0,
	`expiresAt` date,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discount_coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `discount_coupons_code_unique` UNIQUE(`code`)
);
