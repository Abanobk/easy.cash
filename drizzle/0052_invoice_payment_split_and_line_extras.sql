ALTER TABLE `purchase_invoices`
  ADD COLUMN `cashAmount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `bankAmount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `bankAccountId` int,
  ADD COLUMN `receiptType` enum('full','partial') DEFAULT 'full';
--> statement-breakpoint
ALTER TABLE `sales_invoices`
  ADD COLUMN `cashAmount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `bankAmount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `bankAccountId` int;
--> statement-breakpoint
ALTER TABLE `purchase_invoice_items`
  ADD COLUMN `warehouseId` int,
  ADD COLUMN `taxId` int,
  ADD COLUMN `tax2` decimal(5,2) DEFAULT '0',
  ADD COLUMN `tax2Id` int,
  ADD COLUMN `tax3` decimal(5,2) DEFAULT '0',
  ADD COLUMN `tax3Id` int;
--> statement-breakpoint
ALTER TABLE `sales_invoice_items`
  ADD COLUMN `warehouseId` int,
  ADD COLUMN `taxId` int,
  ADD COLUMN `tax2` decimal(5,2) DEFAULT '0',
  ADD COLUMN `tax2Id` int,
  ADD COLUMN `tax3` decimal(5,2) DEFAULT '0',
  ADD COLUMN `tax3Id` int;
--> statement-breakpoint
ALTER TABLE `taxes`
  ADD COLUMN `glAccountId` int;
