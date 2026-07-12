CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_code` text NOT NULL,
	`account_name` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_company_code_unique` ON `customers` (`company_code`);--> statement-breakpoint
CREATE TABLE `environments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`identifier` text NOT NULL,
	`db_size_gb` real NOT NULL,
	`missing_from_last_import` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `environments_identifier_unique` ON `environments` (`identifier`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feed` text NOT NULL,
	`imported_at` integer NOT NULL,
	`row_count` integer NOT NULL,
	`filename` text
);
