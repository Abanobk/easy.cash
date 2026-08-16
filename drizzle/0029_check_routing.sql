CREATE TABLE IF NOT EXISTS `check_routings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `checkId` int NOT NULL,
  `status` enum('unrouted','in_custody','scheduled','deposited','cleared','rejected') NOT NULL DEFAULT 'unrouted',
  `custodianUserId` int,
  `targetBankAccountId` int,
  `plannedDepositDate` date,
  `depositedAt` date,
  `depositedBy` int,
  `closedAt` timestamp NULL,
  `closedBy` int,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `check_routings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `check_routings_tenant_check_uidx` ON `check_routings` (`tenantId`, `checkId`);
--> statement-breakpoint
CREATE INDEX `check_routings_tenant_status_idx` ON `check_routings` (`tenantId`, `status`);
--> statement-breakpoint
CREATE INDEX `check_routings_custodian_idx` ON `check_routings` (`tenantId`, `custodianUserId`);
--> statement-breakpoint
CREATE INDEX `check_routings_planned_idx` ON `check_routings` (`tenantId`, `plannedDepositDate`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `check_routing_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `routingId` int NOT NULL,
  `checkId` int NOT NULL,
  `eventType` enum('created','assign_custody','transfer_custody','route','update_route','deposit','clear','reject','note') NOT NULL,
  `fromUserId` int,
  `toUserId` int,
  `bankAccountId` int,
  `plannedDepositDate` date,
  `notes` text,
  `performedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `check_routing_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `check_routing_events_routing_idx` ON `check_routing_events` (`routingId`);
--> statement-breakpoint
CREATE INDEX `check_routing_events_check_idx` ON `check_routing_events` (`tenantId`, `checkId`);
--> statement-breakpoint
INSERT INTO `check_routings` (`tenantId`, `checkId`, `status`, `createdAt`, `updatedAt`)
SELECT c.`tenantId`, c.`id`, 'unrouted', NOW(), NOW()
FROM `checks` c
WHERE c.`type` = 'incoming'
  AND c.`status` IN ('pending', 'deposited')
  AND NOT EXISTS (
    SELECT 1 FROM `check_routings` r
    WHERE r.`tenantId` = c.`tenantId` AND r.`checkId` = c.`id`
  );
--> statement-breakpoint
UPDATE `check_routings` r
INNER JOIN `checks` c ON c.`id` = r.`checkId` AND c.`tenantId` = r.`tenantId`
SET r.`status` = 'deposited',
    r.`depositedAt` = COALESCE(r.`depositedAt`, c.`dueDate`),
    r.`targetBankAccountId` = COALESCE(r.`targetBankAccountId`, c.`bankAccountId`)
WHERE c.`type` = 'incoming' AND c.`status` = 'deposited' AND r.`status` <> 'deposited';
