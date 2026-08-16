CREATE TABLE IF NOT EXISTS `document_attachments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `entityType` varchar(40) NOT NULL,
  `entityId` int NOT NULL,
  `kind` varchar(40) NOT NULL DEFAULT 'invoice_scan',
  `fileName` varchar(255) NOT NULL,
  `mimeType` varchar(120) NOT NULL DEFAULT 'application/octet-stream',
  `contentBase64` mediumtext,
  `storageKey` varchar(500),
  `storageUrl` varchar(500),
  `extractedJson` text,
  `compareStatus` varchar(32) NOT NULL DEFAULT 'pending',
  `compareNotes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `document_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `document_attachments_entity_idx` ON `document_attachments` (`tenantId`,`entityType`,`entityId`);
--> statement-breakpoint
CREATE INDEX `document_attachments_compare_idx` ON `document_attachments` (`tenantId`,`compareStatus`);
