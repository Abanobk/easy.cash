-- مطابقة كشوف حساب العملاء/الموردين المرفوعة مع دفتر أستاذ الطرف في البرنامج
ALTER TABLE `audit_statement_uploads`
  ADD COLUMN `customerId` int,
  ADD COLUMN `supplierId` int,
  ADD COLUMN `closingBalance` decimal(15,2),
  ADD COLUMN `lineCount` int NOT NULL DEFAULT 0,
  ADD COLUMN `matchedCount` int NOT NULL DEFAULT 0,
  ADD COLUMN `unmatchedCount` int NOT NULL DEFAULT 0,
  ADD COLUMN `systemOnlyCount` int NOT NULL DEFAULT 0,
  ADD COLUMN `reconcileStatus` varchar(32);
--> statement-breakpoint
CREATE TABLE `audit_statement_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL DEFAULT 1,
	`importId` int NOT NULL,
	`lineNo` int NOT NULL DEFAULT 1,
	`txnDate` date NOT NULL,
	`description` text,
	`reference` varchar(120),
	`debit` decimal(15,2) DEFAULT '0',
	`credit` decimal(15,2) DEFAULT '0',
	`balance` decimal(15,2),
	`matchStatus` varchar(32) NOT NULL DEFAULT 'unmatched',
	`matchedDocType` varchar(40),
	`matchedDocNumber` varchar(50),
	`matchNote` varchar(255),
	CONSTRAINT `audit_statement_lines_id` PRIMARY KEY(`id`)
);
