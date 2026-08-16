ALTER TABLE `purchase_invoice_items` ADD `batchId` int;
--> statement-breakpoint
ALTER TABLE `sales_invoice_items` ADD `batchId` int;
--> statement-breakpoint
ALTER TABLE `purchase_return_items` ADD `batchId` int;
--> statement-breakpoint
ALTER TABLE `sales_return_items` ADD `batchId` int;
--> statement-breakpoint
ALTER TABLE `stock_transfer_items` ADD `batchId` int;
--> statement-breakpoint
ALTER TABLE `inventory_adjustment_items` ADD `batchId` int;
--> statement-breakpoint
ALTER TABLE `sales_orders` ADD `convertedInvoiceId` int;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `convertedInvoiceId` int;
