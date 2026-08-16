CREATE TABLE IF NOT EXISTS `customer_sales_reps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `customerId` int NOT NULL,
  `salesRepId` int NOT NULL,
  `commissionRate` decimal(5,2),
  `isPrimary` boolean DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `customer_sales_reps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_sales_reps_uniq` ON `customer_sales_reps` (`tenantId`,`customerId`,`salesRepId`);
--> statement-breakpoint
CREATE INDEX `customer_sales_reps_customer_idx` ON `customer_sales_reps` (`tenantId`,`customerId`);
--> statement-breakpoint
CREATE INDEX `customer_sales_reps_rep_idx` ON `customer_sales_reps` (`tenantId`,`salesRepId`);
--> statement-breakpoint
INSERT INTO `customer_sales_reps` (`tenantId`, `customerId`, `salesRepId`, `isPrimary`)
SELECT `tenantId`, `id`, `salesRepId`, true
FROM `customers`
WHERE `salesRepId` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `customer_sales_reps` csr
    WHERE csr.`tenantId` = `customers`.`tenantId`
      AND csr.`customerId` = `customers`.`id`
      AND csr.`salesRepId` = `customers`.`salesRepId`
  );
