ALTER TABLE `sales_reps` MODIFY COLUMN `commissionRate` decimal(10,4) DEFAULT '0.0000';
--> statement-breakpoint
ALTER TABLE `customer_sales_reps` MODIFY COLUMN `commissionRate` decimal(10,4);
