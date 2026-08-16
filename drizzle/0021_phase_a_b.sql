ALTER TABLE `items` ADD `averageCost` decimal(15,4) DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `company_settings` ADD `requireDocumentApproval` boolean DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `document_approvals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `documentType` enum('sales_invoice','purchase_invoice','journal_entry') NOT NULL,
  `documentId` int NOT NULL,
  `documentNumber` varchar(50),
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `requestedBy` int,
  `reviewedBy` int,
  `reviewedAt` timestamp,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `document_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `depreciation_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `period` varchar(7) NOT NULL,
  `journalReference` varchar(100),
  `totalAmount` decimal(15,2) DEFAULT 0,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `depreciation_runs_id` PRIMARY KEY(`id`)
);
