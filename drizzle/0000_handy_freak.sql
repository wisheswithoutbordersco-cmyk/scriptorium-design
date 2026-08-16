CREATE TYPE "public"."generation_status" AS ENUM('queued', 'generating', 'assembling', 'complete', 'partial', 'error');--> statement-breakpoint
CREATE TYPE "public"."output_style" AS ENUM('full-color', 'coloring');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "generationJobs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" varchar(191),
	"prompt" text NOT NULL,
	"outputStyle" "output_style" NOT NULL,
	"sizePreset" varchar(32) NOT NULL,
	"pageCount" integer NOT NULL,
	"currentPage" integer DEFAULT 0 NOT NULL,
	"processing" boolean DEFAULT false NOT NULL,
	"status" "generation_status" DEFAULT 'queued' NOT NULL,
	"statusMessage" text NOT NULL,
	"pageResults" jsonb NOT NULL,
	"pdfUrl" text,
	"filename" varchar(255) NOT NULL,
	"errorMessage" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(191) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
