CREATE TABLE `paymob_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mode` enum('test','live') NOT NULL DEFAULT 'test',
	`publicConfig` text,
	`encryptedSecret` text,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymob_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'EGP',
	`status` enum('pending','paid','failed') NOT NULL DEFAULT 'pending',
	`providerReference` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_payments_id` PRIMARY KEY(`id`)
);
