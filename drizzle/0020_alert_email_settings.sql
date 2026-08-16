ALTER TABLE `company_settings` ADD COLUMN `alertEmailsEnabled` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `company_settings` ADD COLUMN `alertEmailRecipients` text;
--> statement-breakpoint
ALTER TABLE `company_settings` ADD COLUMN `alertEmailsLastSent` timestamp NULL;
