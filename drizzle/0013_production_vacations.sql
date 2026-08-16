CREATE TABLE IF NOT EXISTS `production_orders` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `number` varchar(50) NOT NULL,
  `productId` int NOT NULL,
  `warehouseId` int NOT NULL,
  `quantity` decimal(15,3) NOT NULL,
  `date` date NOT NULL,
  `status` enum('draft','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `production_order_materials` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `orderId` int NOT NULL,
  `itemId` int NOT NULL,
  `quantity` decimal(15,3) NOT NULL
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `employee_vacation_records` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NOT NULL DEFAULT 1,
  `employeeId` int NOT NULL,
  `vacationTypeId` int,
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `days` int DEFAULT 0,
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'approved',
  `notes` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
