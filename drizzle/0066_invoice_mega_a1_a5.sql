-- مرحلة A1–A5: عمق فاتورة البيع/الشراء مطابقة ميجا
-- رأس: مرجع، نوع/حالة تسليم، خزينة، شحن، عميل مؤقت، هاتف، عنوان، مندوب قابل للتعديل
-- سطر: خصم نقدي، نوع سعر، وحدة، كمية مسلَّمة (أثر مخزني مرحلي)
ALTER TABLE `sales_invoices`
  ADD COLUMN `referenceNumber` varchar(100) NULL,
  ADD COLUMN `deliveryType` enum('full','partial') DEFAULT 'full',
  ADD COLUMN `deliveryStatus` enum('undelivered','partial','delivered') DEFAULT 'undelivered',
  ADD COLUMN `cashAccountId` int NULL,
  ADD COLUMN `shippingAccountId` int NULL,
  ADD COLUMN `tempCustomerName` varchar(255) NULL,
  ADD COLUMN `tempAddress` varchar(500) NULL,
  ADD COLUMN `phone` varchar(50) NULL,
  ADD COLUMN `address` varchar(500) NULL;
--> statement-breakpoint
ALTER TABLE `purchase_invoices`
  ADD COLUMN `deliveryStatus` enum('undelivered','partial','delivered') DEFAULT 'undelivered',
  ADD COLUMN `cashAccountId` int NULL,
  ADD COLUMN `shippingAccountId` int NULL,
  ADD COLUMN `tempSupplierName` varchar(255) NULL,
  ADD COLUMN `tempAddress` varchar(500) NULL,
  ADD COLUMN `phone` varchar(50) NULL,
  ADD COLUMN `address` varchar(500) NULL;
--> statement-breakpoint
ALTER TABLE `sales_invoice_items`
  ADD COLUMN `cashDiscount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `priceType` varchar(100) NULL,
  ADD COLUMN `unit` varchar(50) NULL,
  ADD COLUMN `deliveredQuantity` decimal(15,3) NULL;
--> statement-breakpoint
ALTER TABLE `purchase_invoice_items`
  ADD COLUMN `cashDiscount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `priceType` varchar(100) NULL,
  ADD COLUMN `unit` varchar(50) NULL,
  ADD COLUMN `deliveredQuantity` decimal(15,3) NULL;
