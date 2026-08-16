CREATE TABLE IF NOT EXISTS `bank_statement_imports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `bankAccountId` int NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `periodFrom` date,
  `periodTo` date,
  `openingBalance` decimal(15,2) DEFAULT '0.00',
  `closingBalance` decimal(15,2) DEFAULT '0.00',
  `lineCount` int NOT NULL DEFAULT 0,
  `matchedCount` int NOT NULL DEFAULT 0,
  `unmatchedCount` int NOT NULL DEFAULT 0,
  `status` varchar(32) NOT NULL DEFAULT 'imported',
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `bank_statement_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `bank_statement_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `importId` int NOT NULL,
  `lineNo` int NOT NULL DEFAULT 1,
  `txnDate` date NOT NULL,
  `valueDate` date,
  `description` text,
  `reference` varchar(120),
  `debit` decimal(15,2) DEFAULT '0.00',
  `credit` decimal(15,2) DEFAULT '0.00',
  `balance` decimal(15,2),
  `matchStatus` varchar(32) NOT NULL DEFAULT 'unmatched',
  `matchedBankTxnId` int,
  `matchNote` varchar(255),
  CONSTRAINT `bank_statement_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_statement_uploads` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `kind` varchar(40) NOT NULL,
  `title` varchar(255) NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `partyName` varchar(255),
  `periodFrom` date,
  `periodTo` date,
  `rawText` mediumtext,
  `summaryJson` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `audit_statement_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_finding_closures` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `findingKey` varchar(190) NOT NULL,
  `findingTitle` varchar(500) NOT NULL,
  `category` varchar(120),
  `severity` varchar(20),
  `status` varchar(32) NOT NULL DEFAULT 'open',
  `resolutionNote` text,
  `closedAt` timestamp,
  `closedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `audit_finding_closures_id` PRIMARY KEY(`id`)
);
