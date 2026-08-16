-- وحدات القياس المعتمدة للشركة (مرجع Mega: خصائص عامة → وحدات القياس)
CREATE TABLE IF NOT EXISTS `measure_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL DEFAULT 1,
	`name` varchar(50) NOT NULL,
	`code` varchar(20),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `measure_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `measure_units_tenant_name` UNIQUE(`tenantId`,`name`)
);
