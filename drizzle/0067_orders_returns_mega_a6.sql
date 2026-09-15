-- A6: عمق طلبات ومردودات البيع/الشراء مطابقة ميجا (رأس + سطر + فلاتر قائمة)
-- مردود: حفظ=مسودة بلا مخزن · اعتماد=أثر مخزني
-- ملاحظة: warehouseId موجود مسبقاً على رؤوس المردودات/الطلبات — لا نعيد إضافته
ALTER TABLE `sales_returns`
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `costCenterId` int NULL,
  ADD COLUMN `salesRepId` int NULL,
  ADD COLUMN `referenceNumber` varchar(100) NULL,
  ADD COLUMN `cashAccountId` int NULL,
  ADD COLUMN `phone` varchar(50) NULL,
  ADD COLUMN `address` varchar(500) NULL,
  ADD COLUMN `reason` varchar(255) NULL,
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
--> statement-breakpoint
ALTER TABLE `purchase_returns`
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `costCenterId` int NULL,
  ADD COLUMN `referenceNumber` varchar(100) NULL,
  ADD COLUMN `cashAccountId` int NULL,
  ADD COLUMN `phone` varchar(50) NULL,
  ADD COLUMN `address` varchar(500) NULL,
  ADD COLUMN `reason` varchar(255) NULL,
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
--> statement-breakpoint
ALTER TABLE `sales_return_items`
  ADD COLUMN `warehouseId` int NULL,
  ADD COLUMN `discount` decimal(5,2) DEFAULT '0',
  ADD COLUMN `cashDiscount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `priceType` varchar(100) NULL,
  ADD COLUMN `unit` varchar(50) NULL,
  ADD COLUMN `tax` decimal(5,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `purchase_return_items`
  ADD COLUMN `warehouseId` int NULL,
  ADD COLUMN `discount` decimal(5,2) DEFAULT '0',
  ADD COLUMN `cashDiscount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `priceType` varchar(100) NULL,
  ADD COLUMN `unit` varchar(50) NULL,
  ADD COLUMN `tax` decimal(5,2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `sales_orders`
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `costCenterId` int NULL,
  ADD COLUMN `salesRepId` int NULL,
  ADD COLUMN `referenceNumber` varchar(100) NULL,
  ADD COLUMN `phone` varchar(50) NULL,
  ADD COLUMN `address` varchar(500) NULL,
  ADD COLUMN `currencyCode` varchar(10) DEFAULT 'EGP',
  ADD COLUMN `exchangeRate` decimal(15,6) DEFAULT '1';
--> statement-breakpoint
ALTER TABLE `purchase_orders`
  ADD COLUMN `branchId` int NULL,
  ADD COLUMN `costCenterId` int NULL,
  ADD COLUMN `referenceNumber` varchar(100) NULL,
  ADD COLUMN `phone` varchar(50) NULL,
  ADD COLUMN `address` varchar(500) NULL,
  ADD COLUMN `currencyCode` varchar(10) DEFAULT 'EGP',
  ADD COLUMN `exchangeRate` decimal(15,6) DEFAULT '1';
--> statement-breakpoint
ALTER TABLE `sales_order_items`
  ADD COLUMN `warehouseId` int NULL,
  ADD COLUMN `cashDiscount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `priceType` varchar(100) NULL,
  ADD COLUMN `unit` varchar(50) NULL;
--> statement-breakpoint
ALTER TABLE `purchase_order_items`
  ADD COLUMN `warehouseId` int NULL,
  ADD COLUMN `cashDiscount` decimal(15,2) DEFAULT '0',
  ADD COLUMN `priceType` varchar(100) NULL,
  ADD COLUMN `unit` varchar(50) NULL;
