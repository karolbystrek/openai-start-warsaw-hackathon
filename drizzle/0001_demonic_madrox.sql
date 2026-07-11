DROP INDEX `decision_records_event_idx`;--> statement-breakpoint
ALTER TABLE `decision_records` ADD `policy_version` text DEFAULT 'legacy-policy-v0' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `decision_records_evaluation_idx` ON `decision_records` (`request_id`,`request_version`,`event_id`,`policy_version`);