CREATE TABLE `generationJobs` (
	`id` varchar(64) NOT NULL,
	`prompt` text NOT NULL,
	`outputStyle` enum('full-color','coloring') NOT NULL,
	`sizePreset` varchar(32) NOT NULL,
	`pageCount` int NOT NULL,
	`currentPage` int NOT NULL DEFAULT 0,
	`processing` boolean NOT NULL DEFAULT false,
	`status` enum('queued','generating','assembling','complete','partial','error') NOT NULL DEFAULT 'queued',
	`statusMessage` text NOT NULL,
	`pageResults` json NOT NULL,
	`pdfUrl` text,
	`filename` varchar(255) NOT NULL,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generationJobs_id` PRIMARY KEY(`id`)
);
