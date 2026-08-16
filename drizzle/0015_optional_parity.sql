CREATE TABLE IF NOT EXISTS `machine_punches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `machineId` int,
  `enrollCode` varchar(50) NOT NULL,
  `employeeId` int,
  `punchedAt` datetime NOT NULL,
  `processed` boolean DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `machine_punches_id` PRIMARY KEY(`id`)
);

--> statement-breakpoint
ALTER TABLE `fingerprint_machines` ADD `lastSyncAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `attendance` ADD `source` varchar(30) DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE `attendance` ADD `machineId` int NULL;
