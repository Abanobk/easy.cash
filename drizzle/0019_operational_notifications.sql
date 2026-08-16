ALTER TABLE `notifications` ADD COLUMN `referenceKey` varchar(120);
--> statement-breakpoint
ALTER TABLE `notifications` ADD COLUMN `href` varchar(255);
--> statement-breakpoint
CREATE INDEX `notifications_tenant_user_ref_idx` ON `notifications` (`tenantId`, `userId`, `referenceKey`);
