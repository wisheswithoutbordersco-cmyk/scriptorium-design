ALTER TABLE "generationJobs" ADD COLUMN "referenceImageCount" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "generationJobs"
SET "referenceImageCount" = CASE
  WHEN jsonb_typeof("referenceImages") = 'array'
    THEN jsonb_array_length("referenceImages")
  ELSE 0
END;
