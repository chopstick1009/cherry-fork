CREATE TABLE `annotation` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`message_id` text NOT NULL,
	`role` text NOT NULL,
	`part_id` text NOT NULL,
	`kind` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`exact` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`suffix` text DEFAULT '' NOT NULL,
	`content` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topic`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "annotation_kind_check" CHECK("annotation"."kind" IN ('underline', 'thought', 'followup')),
	CONSTRAINT "annotation_role_check" CHECK("annotation"."role" IN ('user', 'assistant', 'system')),
	CONSTRAINT "annotation_range_check" CHECK(("annotation"."start" >= 0 and "annotation"."end" > "annotation"."start"))
);
--> statement-breakpoint
CREATE INDEX `annotation_topic_id_created_at_idx` ON `annotation` (`topic_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `annotation_message_id_idx` ON `annotation` (`message_id`);