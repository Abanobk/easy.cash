-- Mega Cash parity tables
CREATE TABLE IF NOT EXISTS `exchange_rates` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `code` varchar(10) NOT NULL,
  `name` varchar(100) NOT NULL,
  `rate` decimal(15,6) NOT NULL,
  `isDefault` boolean DEFAULT false,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `general_attributes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `attrKey` varchar(100) NOT NULL,
  `attrValue` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fiscal_years` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(100) NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_activities` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `userId` int,
  `userName` varchar(255),
  `action` varchar(255) NOT NULL,
  `details` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cities` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `governorate` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_addresses` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `label` varchar(255) NOT NULL,
  `address` text,
  `cityId` int,
  `phone` varchar(50),
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hr_shifts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `startTime` varchar(10) NOT NULL,
  `endTime` varchar(10) NOT NULL,
  `isActive` boolean DEFAULT true,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hr_vacations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `daysPerYear` int DEFAULT 0,
  `isPaid` boolean DEFAULT true,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `employee_shifts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `employeeId` int NOT NULL,
  `shiftId` int NOT NULL,
  `effectiveFrom` date,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hr_incentives` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `employeeId` int NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `date` date NOT NULL,
  `reason` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `under_request_employees` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `phone` varchar(50),
  `dailyRate` decimal(15,2) DEFAULT 0,
  `notes` text,
  `isActive` boolean DEFAULT true,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fingerprint_machines` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `ipAddress` varchar(50),
  `port` int,
  `isActive` boolean DEFAULT true,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mobile_fp_locations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `latitude` decimal(10,7),
  `longitude` decimal(10,7),
  `radiusMeters` int DEFAULT 100,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hr_systems` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `description` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hr_dep_emp_systems` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `systemId` int NOT NULL,
  `departmentId` int,
  `employeeId` int,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `item_batches` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `itemId` int NOT NULL,
  `batchNumber` varchar(100) NOT NULL,
  `expiryDate` date,
  `quantity` decimal(15,3) DEFAULT 0,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `item_offers` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `discountPercent` decimal(5,2) DEFAULT 0,
  `startDate` date,
  `endDate` date,
  `isActive` boolean DEFAULT true,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `item_price_changes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `itemId` int NOT NULL,
  `oldPrice` decimal(15,2),
  `newPrice` decimal(15,2) NOT NULL,
  `priceType` enum('sale','purchase') NOT NULL DEFAULT 'sale',
  `date` date NOT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `beginning_inventory` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `warehouseId` int NOT NULL,
  `itemId` int NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `unitCost` decimal(15,2) DEFAULT 0,
  `date` date NOT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `asset_categories` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `depreciationRate` decimal(5,2) DEFAULT 0,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `asset_capital_maintenance` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `assetId` int NOT NULL,
  `date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `description` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `asset_sales` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `assetId` int NOT NULL,
  `date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `buyer` varchar(255),
  `notes` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sales_areas` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `description` text,
  `isActive` boolean DEFAULT true,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
