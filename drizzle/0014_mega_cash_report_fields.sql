ALTER TABLE `customers` ADD `salesRepId` int;
--> statement-breakpoint
ALTER TABLE `customers` ADD `branchId` int;
--> statement-breakpoint
ALTER TABLE `customers` ADD `areaId` int;

--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD `salesRepId` int;
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD `branchId` int;
--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD `costCenterId` int;

--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `branchId` int;
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `costCenterId` int;

--> statement-breakpoint
ALTER TABLE `journal_entry_lines` ADD `costCenterId` int;
