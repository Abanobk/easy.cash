ALTER TABLE `import_cost_shipments` ADD `freightLocalEgp` decimal(18,6) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE `import_cost_shipments` ADD `shippingQuote` text;
