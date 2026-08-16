CREATE TABLE IF NOT EXISTS `ops_inbox_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `source` varchar(32) NOT NULL DEFAULT 'whatsapp',
  `channelNote` varchar(255),
  `workDate` date,
  `rawText` text,
  `fileName` varchar(255),
  `mimeType` varchar(120),
  `contentBase64` mediumtext,
  `suggestedType` varchar(40) NOT NULL DEFAULT 'other',
  `extractedJson` text,
  `draftJson` text,
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `confidence` decimal(5,2) DEFAULT '0.00',
  `confirmedEntityType` varchar(40),
  `confirmedEntityId` int,
  `confirmedRef` varchar(120),
  `reviewNote` text,
  `createdBy` int,
  `reviewedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ops_inbox_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ops_inbox_source_date_idx` ON `ops_inbox_items` (`tenantId`,`source`,`workDate`);
--> statement-breakpoint
CREATE INDEX `ops_inbox_status_idx` ON `ops_inbox_items` (`tenantId`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `factory_daily_uploads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `workDate` date NOT NULL,
  `title` varchar(255) NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `mimeType` varchar(120) NOT NULL DEFAULT 'application/octet-stream',
  `contentBase64` mediumtext,
  `notes` text,
  `status` varchar(32) NOT NULL DEFAULT 'uploaded',
  `extractedJson` text,
  `linkedInboxItemId` int,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `factory_daily_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `factory_daily_date_idx` ON `factory_daily_uploads` (`tenantId`,`workDate`);
