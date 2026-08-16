ALTER TABLE `company_profile` ADD COLUMN `defaultPrintTemplate` varchar(32) DEFAULT 'standard-a4';
--> statement-breakpoint
ALTER TABLE `company_profile` ADD COLUMN `etaEnabled` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `company_profile` ADD COLUMN `etaMode` varchar(16) DEFAULT 'preprod';
--> statement-breakpoint
ALTER TABLE `company_profile` ADD COLUMN `etaClientId` varchar(255) NULL;
--> statement-breakpoint
ALTER TABLE `company_profile` ADD COLUMN `etaClientSecretEnc` text NULL;
--> statement-breakpoint
ALTER TABLE `company_profile` ADD COLUMN `etaActivityCode` varchar(20) NULL;
--> statement-breakpoint
ALTER TABLE `company_profile` ADD COLUMN `etaBranchCode` varchar(20) NULL;
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD COLUMN `etaUuid` varchar(64) NULL;
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD COLUMN `etaStatus` varchar(32) NULL;
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD COLUMN `etaSubmittedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD COLUMN `etaSubmissionId` varchar(128) NULL;
