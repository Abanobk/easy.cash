ALTER TABLE `customers` ADD COLUMN `linkedSupplierId` int;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `linkedCustomerId` int;
--> statement-breakpoint
CREATE INDEX `customers_linked_supplier_idx` ON `customers` (`tenantId`, `linkedSupplierId`);
--> statement-breakpoint
CREATE INDEX `suppliers_linked_customer_idx` ON `suppliers` (`tenantId`, `linkedCustomerId`);
