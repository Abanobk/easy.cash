-- صلاحيات تفصيلية زي ميجا كاش (قسم ← عنصر ← أفعال) — shared/permission-tree.ts
CREATE TABLE IF NOT EXISTS `tenant_entity_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`role` varchar(64) NOT NULL,
	`moduleKey` varchar(64) NOT NULL,
	`entityKey` varchar(128) NOT NULL,
	`allowedActions` json NOT NULL DEFAULT ('[]'),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_entity_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_entity_permissions_unique` UNIQUE(`tenantId`,`role`,`moduleKey`,`entityKey`)
);
