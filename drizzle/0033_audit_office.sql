CREATE TABLE IF NOT EXISTS `company_audit_policies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `targetGrossMarginPct` decimal(8,2) NOT NULL DEFAULT '25.00',
  `targetNetMarginPct` decimal(8,2) NOT NULL DEFAULT '10.00',
  `maxArDays` int NOT NULL DEFAULT 90,
  `maxApDays` int NOT NULL DEFAULT 90,
  `minCashReserveEgp` decimal(15,2) NOT NULL DEFAULT '0.00',
  `debtProvisionAfterDays` int NOT NULL DEFAULT 120,
  `debtProvisionRate` decimal(8,4) NOT NULL DEFAULT '0.0500',
  `defaultDepreciationRate` decimal(8,4) NOT NULL DEFAULT '0.1000',
  `bankVarianceToleranceEgp` decimal(15,2) NOT NULL DEFAULT '50.00',
  `materialityEgp` decimal(15,2) NOT NULL DEFAULT '1000.00',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `company_audit_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_review_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `generatedAt` timestamp NOT NULL DEFAULT (now()),
  `criticalCount` int NOT NULL DEFAULT 0,
  `warningCount` int NOT NULL DEFAULT 0,
  `infoCount` int NOT NULL DEFAULT 0,
  `tbBalanced` boolean NOT NULL DEFAULT false,
  `tbDifference` decimal(15,2) NOT NULL DEFAULT '0.00',
  `summaryJson` text,
  `findingsJson` text,
  `createdBy` int,
  CONSTRAINT `audit_review_runs_id` PRIMARY KEY(`id`)
);
