CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`ownerUserId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `app_users` ADD `tenantId` int;
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `tenantId` int;
--> statement-breakpoint
ALTER TABLE `company_settings` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `branches` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `contact_categories` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `customers` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `warehouses` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `item_categories` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `item_warehouse_stock` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `taxes` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `purchase_invoice_items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `purchase_returns` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `purchase_return_items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `sales_orders` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `sales_order_items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `sales_invoice_items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `sales_returns` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `sales_return_items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `cash_transactions` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `checks` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `journal_entry_lines` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `departments` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `job_titles` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `employees` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `attendance` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `salary_advances` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `payroll` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `fixed_assets` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `cost_centers` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `loans` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `installments` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `notifications` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `inventory_adjustments` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `stock_transfer_items` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `sales_reps` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `company_profile` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `tenantId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `user_notifications` ADD `tenantId` int NOT NULL DEFAULT 1;
