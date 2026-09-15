-- D: حركات الخزينة والبنك تتبع نمط الفاتورة في ميجا — حفظ = مسودة بلا قيد، اعتماد = قيد + توزيع FIFO
-- السجلات الحالية اتحفظت أصلاً بقيد مرحّل فور الإدخال (السلوك القديم) — فبنعتبرها "معتمدة" بأثر رجعي بدل ما نكسر ميزانها
ALTER TABLE `cash_transactions`
  ADD COLUMN `status` enum('draft','confirmed','cancelled') NOT NULL DEFAULT 'draft',
  ADD COLUMN `referenceNumber` varchar(100) NULL,
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT (now());
--> statement-breakpoint
UPDATE `cash_transactions` SET `status` = 'confirmed';
--> statement-breakpoint
ALTER TABLE `bank_transactions`
  ADD COLUMN `status` enum('draft','confirmed','cancelled') NOT NULL DEFAULT 'draft',
  ADD COLUMN `referenceNumber` varchar(100) NULL,
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT (now());
--> statement-breakpoint
UPDATE `bank_transactions` SET `status` = 'confirmed';
--> statement-breakpoint
-- سجل توزيع الدفعة (استلام/سداد نقدي) على الفواتير (FIFO) — بدونه ما نقدرش نفك اعتماد حركة نقدية بأمان
CREATE TABLE `cash_transaction_allocations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `transactionId` int NOT NULL,
  `documentType` enum('sales_invoice','purchase_invoice') NOT NULL,
  `documentId` int NOT NULL,
  `invoiceNumber` varchar(50) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE INDEX `cash_transaction_allocations_transactionId_idx` ON `cash_transaction_allocations` (`transactionId`);
--> statement-breakpoint
-- نفس فكرة سجل التوزيع بس لحركات البنك (إيداع/سحب)
CREATE TABLE `bank_transaction_allocations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `transactionId` int NOT NULL,
  `documentType` enum('sales_invoice','purchase_invoice') NOT NULL,
  `documentId` int NOT NULL,
  `invoiceNumber` varchar(50) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE INDEX `bank_transaction_allocations_transactionId_idx` ON `bank_transaction_allocations` (`transactionId`);
