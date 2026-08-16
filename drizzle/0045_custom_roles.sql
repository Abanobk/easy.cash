-- أدوار مخصصة للمستأجر + تحويل مفاتيح الدور إلى varchar (زي مجموعات المستخدمين في Mega)
CREATE TABLE IF NOT EXISTS `tenant_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`roleKey` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`isBuiltin` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_roles_tenant_key` UNIQUE(`tenantId`,`roleKey`)
);
--> statement-breakpoint
ALTER TABLE `tenant_role_permissions` MODIFY COLUMN `role` varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE `tenant_screen_permissions` MODIFY COLUMN `role` varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE `app_users` MODIFY COLUMN `role` varchar(64) NOT NULL DEFAULT 'user';
