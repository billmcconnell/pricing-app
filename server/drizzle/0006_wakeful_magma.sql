CREATE TABLE `assumption_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`old_value` real NOT NULL,
	`new_value` real NOT NULL,
	`changed_by` text NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`key`) REFERENCES `assumptions`(`key`) ON UPDATE no action ON DELETE no action
);
