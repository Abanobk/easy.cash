CREATE TABLE `paymob_payment_methods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`methodType` enum('card','wallet') NOT NULL,
	`integrationId` int NOT NULL DEFAULT 0,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymob_payment_methods_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymob_payment_methods_methodType_unique` UNIQUE(`methodType`)
);
