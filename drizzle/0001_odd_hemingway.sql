CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`parentId` int,
	`type` enum('asset','liability','equity','revenue','expense') NOT NULL,
	`isParent` boolean DEFAULT false,
	`balance` decimal(15,2) DEFAULT '0',
	`notes` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`date` date NOT NULL,
	`checkIn` varchar(10),
	`checkOut` varchar(10),
	`status` enum('present','absent','late','leave','holiday') DEFAULT 'present',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`bankName` varchar(255),
	`accountNumber` varchar(100),
	`balance` decimal(15,2) DEFAULT '0',
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`type` enum('deposit','withdraw','deposit_customer','withdraw_supplier') NOT NULL,
	`bankAccountId` int NOT NULL,
	`date` date NOT NULL,
	`customerId` int,
	`supplierId` int,
	`amount` decimal(15,2) NOT NULL,
	`description` text,
	`reference` varchar(100),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bank_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`phone` varchar(50),
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cash_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`type` enum('receive','pay','receive_customer','pay_supplier') NOT NULL,
	`date` date NOT NULL,
	`customerId` int,
	`supplierId` int,
	`amount` decimal(15,2) NOT NULL,
	`accountId` int,
	`description` text,
	`reference` varchar(100),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`checkNumber` varchar(100) NOT NULL,
	`type` enum('incoming','outgoing') NOT NULL,
	`bankAccountId` int,
	`customerId` int,
	`supplierId` int,
	`amount` decimal(15,2) NOT NULL,
	`dueDate` date NOT NULL,
	`date` date NOT NULL,
	`status` enum('pending','deposited','cleared','bounced','cancelled') DEFAULT 'pending',
	`description` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`phone` varchar(50),
	`email` varchar(255),
	`taxNumber` varchar(100),
	`logo` text,
	`currency` varchar(10) DEFAULT 'EGP',
	`fiscalYearStart` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('customer','supplier','both') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cost_centers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50),
	`name` varchar(255) NOT NULL,
	`parentId` int,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_centers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50),
	`name` varchar(255) NOT NULL,
	`categoryId` int,
	`phone` varchar(50),
	`phone2` varchar(50),
	`email` varchar(255),
	`address` text,
	`city` varchar(100),
	`taxNumber` varchar(100),
	`creditLimit` decimal(15,2) DEFAULT '0',
	`balance` decimal(15,2) DEFAULT '0',
	`notes` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`parentId` int,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `departments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50),
	`name` varchar(255) NOT NULL,
	`nationalId` varchar(50),
	`departmentId` int,
	`jobTitleId` int,
	`hireDate` date,
	`birthDate` date,
	`phone` varchar(50),
	`email` varchar(255),
	`address` text,
	`basicSalary` decimal(15,2) DEFAULT '0',
	`bankAccount` varchar(100),
	`status` enum('active','inactive','terminated') DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fixed_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50),
	`name` varchar(255) NOT NULL,
	`category` varchar(100),
	`purchaseDate` date,
	`purchasePrice` decimal(15,2) DEFAULT '0',
	`depreciationRate` decimal(5,2) DEFAULT '0',
	`currentValue` decimal(15,2) DEFAULT '0',
	`location` varchar(255),
	`status` enum('active','disposed','under_maintenance') DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fixed_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loanId` int NOT NULL,
	`dueDate` date NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`paidAmount` decimal(15,2) DEFAULT '0',
	`status` enum('pending','paid','overdue') DEFAULT 'pending',
	`paidDate` date,
	`notes` text,
	CONSTRAINT `installments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_adjustment_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adjustmentId` int NOT NULL,
	`itemId` int NOT NULL,
	`currentQty` decimal(15,3) DEFAULT '0',
	`newQty` decimal(15,3) NOT NULL,
	`difference` decimal(15,3) DEFAULT '0',
	CONSTRAINT `inventory_adjustment_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`warehouseId` int NOT NULL,
	`date` date NOT NULL,
	`reason` text,
	`status` enum('draft','confirmed','cancelled') DEFAULT 'draft',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`parentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_warehouse_stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`warehouseId` int NOT NULL,
	`quantity` decimal(15,3) DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `item_warehouse_stock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100),
	`barcode` varchar(100),
	`name` varchar(255) NOT NULL,
	`categoryId` int,
	`unit` varchar(50) DEFAULT 'قطعة',
	`purchasePrice` decimal(15,2) DEFAULT '0',
	`salePrice` decimal(15,2) DEFAULT '0',
	`minStock` decimal(15,3) DEFAULT '0',
	`currentStock` decimal(15,3) DEFAULT '0',
	`taxRate` decimal(5,2) DEFAULT '0',
	`description` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_titles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_titles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`date` date NOT NULL,
	`description` text,
	`reference` varchar(100),
	`status` enum('draft','posted','cancelled') DEFAULT 'draft',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `journal_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `journal_entry_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entryId` int NOT NULL,
	`accountId` int NOT NULL,
	`debit` decimal(15,2) DEFAULT '0',
	`credit` decimal(15,2) DEFAULT '0',
	`description` text,
	CONSTRAINT `journal_entry_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`type` enum('given','received') NOT NULL,
	`partyName` varchar(255) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`interestRate` decimal(5,2) DEFAULT '0',
	`startDate` date NOT NULL,
	`endDate` date,
	`status` enum('active','paid','cancelled') DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text,
	`type` enum('info','warning','error','success') DEFAULT 'info',
	`isRead` boolean DEFAULT false,
	`userId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`basicSalary` decimal(15,2) DEFAULT '0',
	`allowances` decimal(15,2) DEFAULT '0',
	`deductions` decimal(15,2) DEFAULT '0',
	`advances` decimal(15,2) DEFAULT '0',
	`tax` decimal(15,2) DEFAULT '0',
	`netSalary` decimal(15,2) DEFAULT '0',
	`status` enum('draft','approved','paid') DEFAULT 'draft',
	`paidDate` date,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`price` decimal(15,2) NOT NULL,
	`discount` decimal(5,2) DEFAULT '0',
	`tax` decimal(5,2) DEFAULT '0',
	`total` decimal(15,2) NOT NULL,
	CONSTRAINT `purchase_invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`supplierId` int NOT NULL,
	`orderId` int,
	`date` date NOT NULL,
	`dueDate` date,
	`warehouseId` int,
	`paymentType` enum('cash','credit') DEFAULT 'cash',
	`subtotal` decimal(15,2) DEFAULT '0',
	`discount` decimal(15,2) DEFAULT '0',
	`tax` decimal(15,2) DEFAULT '0',
	`total` decimal(15,2) DEFAULT '0',
	`paid` decimal(15,2) DEFAULT '0',
	`remaining` decimal(15,2) DEFAULT '0',
	`status` enum('draft','confirmed','paid','partial','cancelled') DEFAULT 'draft',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`price` decimal(15,2) NOT NULL,
	`discount` decimal(5,2) DEFAULT '0',
	`tax` decimal(5,2) DEFAULT '0',
	`total` decimal(15,2) NOT NULL,
	CONSTRAINT `purchase_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`supplierId` int NOT NULL,
	`date` date NOT NULL,
	`expectedDate` date,
	`warehouseId` int,
	`subtotal` decimal(15,2) DEFAULT '0',
	`discount` decimal(15,2) DEFAULT '0',
	`tax` decimal(15,2) DEFAULT '0',
	`total` decimal(15,2) DEFAULT '0',
	`status` enum('draft','confirmed','received','cancelled') DEFAULT 'draft',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_return_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`returnId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`price` decimal(15,2) NOT NULL,
	`total` decimal(15,2) NOT NULL,
	CONSTRAINT `purchase_return_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`supplierId` int NOT NULL,
	`invoiceId` int,
	`date` date NOT NULL,
	`warehouseId` int,
	`subtotal` decimal(15,2) DEFAULT '0',
	`discount` decimal(15,2) DEFAULT '0',
	`tax` decimal(15,2) DEFAULT '0',
	`total` decimal(15,2) DEFAULT '0',
	`status` enum('draft','confirmed','cancelled') DEFAULT 'draft',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `salary_advances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`date` date NOT NULL,
	`reason` text,
	`status` enum('pending','approved','paid','rejected') DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salary_advances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`price` decimal(15,2) NOT NULL,
	`discount` decimal(5,2) DEFAULT '0',
	`tax` decimal(5,2) DEFAULT '0',
	`total` decimal(15,2) NOT NULL,
	CONSTRAINT `sales_invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`customerId` int NOT NULL,
	`orderId` int,
	`date` date NOT NULL,
	`dueDate` date,
	`warehouseId` int,
	`paymentType` enum('cash','credit') DEFAULT 'cash',
	`subtotal` decimal(15,2) DEFAULT '0',
	`discount` decimal(15,2) DEFAULT '0',
	`tax` decimal(15,2) DEFAULT '0',
	`total` decimal(15,2) DEFAULT '0',
	`paid` decimal(15,2) DEFAULT '0',
	`remaining` decimal(15,2) DEFAULT '0',
	`status` enum('draft','confirmed','paid','partial','cancelled') DEFAULT 'draft',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`price` decimal(15,2) NOT NULL,
	`discount` decimal(5,2) DEFAULT '0',
	`tax` decimal(5,2) DEFAULT '0',
	`total` decimal(15,2) NOT NULL,
	CONSTRAINT `sales_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`customerId` int NOT NULL,
	`date` date NOT NULL,
	`expectedDate` date,
	`warehouseId` int,
	`subtotal` decimal(15,2) DEFAULT '0',
	`discount` decimal(15,2) DEFAULT '0',
	`tax` decimal(15,2) DEFAULT '0',
	`total` decimal(15,2) DEFAULT '0',
	`status` enum('draft','confirmed','delivered','cancelled') DEFAULT 'draft',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_reps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(50),
	`email` varchar(255),
	`commissionRate` decimal(5,2) DEFAULT '0',
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_reps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_return_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`returnId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	`price` decimal(15,2) NOT NULL,
	`total` decimal(15,2) NOT NULL,
	CONSTRAINT `sales_return_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`customerId` int NOT NULL,
	`invoiceId` int,
	`date` date NOT NULL,
	`warehouseId` int,
	`subtotal` decimal(15,2) DEFAULT '0',
	`tax` decimal(15,2) DEFAULT '0',
	`total` decimal(15,2) DEFAULT '0',
	`status` enum('draft','confirmed','cancelled') DEFAULT 'draft',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_transfer_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transferId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` decimal(15,3) NOT NULL,
	CONSTRAINT `stock_transfer_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(50) NOT NULL,
	`fromWarehouseId` int NOT NULL,
	`toWarehouseId` int NOT NULL,
	`date` date NOT NULL,
	`status` enum('draft','confirmed','cancelled') DEFAULT 'draft',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50),
	`name` varchar(255) NOT NULL,
	`categoryId` int,
	`phone` varchar(50),
	`phone2` varchar(50),
	`email` varchar(255),
	`address` text,
	`city` varchar(100),
	`taxNumber` varchar(100),
	`balance` decimal(15,2) DEFAULT '0',
	`notes` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taxes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`rate` decimal(5,2) NOT NULL,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `taxes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warehouses_id` PRIMARY KEY(`id`)
);
