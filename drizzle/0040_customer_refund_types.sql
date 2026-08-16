-- Expand cash/bank enums for customer refunds (commission reverse)
ALTER TABLE `cash_transactions`
  MODIFY COLUMN `type` ENUM('receive','pay','receive_customer','pay_supplier','pay_customer') NOT NULL;
--> statement-breakpoint
ALTER TABLE `bank_transactions`
  MODIFY COLUMN `type` ENUM('deposit','withdraw','deposit_customer','withdraw_supplier','withdraw_customer') NOT NULL;
