-- سجل توزيع تحصيل الشيكات على الفواتير (FIFO)، عشان فك اعتماد التحصيل يقدر يرجّع كل فاتورة اتأثرت لحالتها الصح
CREATE TABLE `check_payment_allocations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `checkId` int NOT NULL,
  `documentType` enum('sales_invoice','purchase_invoice') NOT NULL,
  `documentId` int NOT NULL,
  `invoiceNumber` varchar(50) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE INDEX `check_payment_allocations_checkId_idx` ON `check_payment_allocations` (`checkId`);
--> statement-breakpoint
-- الحالة قبل التحصيل (pending/deposited)، عشان فك الاعتماد يرجّع الشيك لحالته الصح مش pending دايماً
ALTER TABLE `checks`
  ADD COLUMN `statusBeforeClear` enum('pending','deposited');
