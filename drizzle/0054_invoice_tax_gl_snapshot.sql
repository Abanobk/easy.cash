ALTER TABLE `purchase_invoice_taxes`
  ADD COLUMN `glAccountId` int;
--> statement-breakpoint
ALTER TABLE `sales_invoice_taxes`
  ADD COLUMN `glAccountId` int;
