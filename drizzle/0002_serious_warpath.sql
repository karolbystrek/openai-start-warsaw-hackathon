CREATE TABLE `mandate_versions` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_version` integer NOT NULL,
	`status` text NOT NULL,
	`effective_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mandate_versions_id_version_idx` ON `mandate_versions` (`id`,`version`);