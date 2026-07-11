CREATE TABLE `decision_records` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`request_version` integer NOT NULL,
	`event_id` text NOT NULL,
	`outcome` text NOT NULL,
	`decided_at` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_records_event_idx` ON `decision_records` (`event_id`);--> statement-breakpoint
CREATE TABLE `offer_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`observed_at` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_versions` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`effective_at` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_versions_id_version_idx` ON `request_versions` (`id`,`version`);--> statement-breakpoint
CREATE TABLE `simulated_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `simulated_orders_idempotency_key_unique` ON `simulated_orders` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `simulation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `simulation_events_run_sequence_idx` ON `simulation_events` (`run_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `simulation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` text NOT NULL,
	`virtual_start_at` text NOT NULL,
	`created_at` text NOT NULL
);
