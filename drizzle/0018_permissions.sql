CREATE TABLE IF NOT EXISTS `tenant_role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`role` enum('admin','user','accountant','sales_rep','warehouse_manager') NOT NULL,
	`module` varchar(64) NOT NULL,
	`canView` boolean NOT NULL DEFAULT false,
	`canCreate` boolean NOT NULL DEFAULT false,
	`canEdit` boolean NOT NULL DEFAULT false,
	`canDelete` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_role_permissions_unique` UNIQUE(`tenantId`,`role`,`module`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_permission_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`module` varchar(64) NOT NULL,
	`canView` boolean,
	`canCreate` boolean,
	`canEdit` boolean,
	`canDelete` boolean,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_permission_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_permission_overrides_unique` UNIQUE(`userId`,`module`)
);
