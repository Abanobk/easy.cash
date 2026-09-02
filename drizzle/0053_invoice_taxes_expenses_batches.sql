-- قوائم متكررة على مستوى الفاتورة: ضرائب، مصروفات، وتعدد التشغيلات لكل بند — زي ميجا كاش
CREATE TABLE `purchase_invoice_item_batches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `invoiceItemId` int NOT NULL,
  `batchId` int,
  `batchNumber` varchar(100),
  `expiryDate` date,
  `quantity` decimal(15,3) NOT NULL,
  CONSTRAINT `purchase_invoice_item_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_invoice_item_batches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `invoiceItemId` int NOT NULL,
  `batchId` int,
  `batchNumber` varchar(100),
  `expiryDate` date,
  `quantity` decimal(15,3) NOT NULL,
  CONSTRAINT `sales_invoice_item_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_invoice_taxes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `invoiceId` int NOT NULL,
  `taxId` int,
  `name` varchar(255),
  `rate` decimal(5,2) DEFAULT '0',
  `amount` decimal(15,2) NOT NULL,
  CONSTRAINT `purchase_invoice_taxes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_invoice_taxes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `invoiceId` int NOT NULL,
  `taxId` int,
  `name` varchar(255),
  `rate` decimal(5,2) DEFAULT '0',
  `amount` decimal(15,2) NOT NULL,
  CONSTRAINT `sales_invoice_taxes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_invoice_expenses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `invoiceId` int NOT NULL,
  `currencyCode` varchar(10) DEFAULT 'EGP',
  `exchangeRate` decimal(15,6) DEFAULT '1',
  `amount` decimal(15,2) NOT NULL,
  `creditAccountId` int NOT NULL,
  `notes` text,
  CONSTRAINT `purchase_invoice_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_invoice_expenses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `invoiceId` int NOT NULL,
  `currencyCode` varchar(10) DEFAULT 'EGP',
  `exchangeRate` decimal(15,6) DEFAULT '1',
  `amount` decimal(15,2) NOT NULL,
  `creditAccountId` int NOT NULL,
  `notes` text,
  CONSTRAINT `sales_invoice_expenses_id` PRIMARY KEY(`id`)
);
