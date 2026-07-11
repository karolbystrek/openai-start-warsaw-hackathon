CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_monitoring_requests` (
	`chat_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_version` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_monitoring_request_idx` ON `chat_monitoring_requests` (`chat_id`,`request_id`,`request_version`);--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_session_id` text NOT NULL,
	`title` text NOT NULL,
	`state_payload` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
