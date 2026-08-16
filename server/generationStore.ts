import { and, eq, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generationJobs, type GenerationJob, type GenerationPageResult } from "../drizzle/schema";
import { getDb } from "./db";

export type GenerationStatus = "queued" | "generating" | "assembling" | "complete" | "partial" | "error";

export type StoredGenerationOptions = {
  prompt: string;
  outputStyle: "full-color" | "coloring";
  sizePreset: "8.5x11-portrait" | "8.5x11-landscape" | "11x14" | "16x20" | "square";
  pageCount: number;
  branding: "none";
  showPageNumbers: false;
  upscale: false;
};

export type PublicGenerationJob = Omit<GenerationJob, "processing">;

function toPublicJob(job: GenerationJob): PublicGenerationJob {
  const { processing: _processing, ...publicJob } = job;
  return publicJob;
}

export async function createGenerationJob(
  options: StoredGenerationOptions,
  /** Clerk user id of the signed-in owner. */
  userId: string
): Promise<PublicGenerationJob> {
  const db = await getDb();
  if (!db) throw new Error("The generation database is unavailable");

  const id = nanoid(18);
  await db.insert(generationJobs).values({
    id,
    userId,
    prompt: options.prompt,
    outputStyle: options.outputStyle,
    sizePreset: options.sizePreset,
    pageCount: options.pageCount,
    statusMessage: "Ready to generate",
    pageResults: [],
    filename: `scriptorium-${Date.now()}.pdf`,
  });

  const job = await getGenerationJobInternal(id);
  if (!job) throw new Error("Unable to create the generation job");
  return toPublicJob(job);
}

async function getGenerationJobInternal(id: string): Promise<GenerationJob | null> {
  const db = await getDb();
  if (!db) throw new Error("The generation database is unavailable");
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1);
  return job ?? null;
}

export async function getGenerationJob(id: string): Promise<PublicGenerationJob | null> {
  const job = await getGenerationJobInternal(id);
  return job ? toPublicJob(job) : null;
}

/**
 * Returns the job only when it belongs to the given Clerk user, so one signed-in
 * customer can never read or drive another customer's job by guessing its id.
 */
export async function getGenerationJobForUser(
  id: string,
  userId: string
): Promise<PublicGenerationJob | null> {
  const job = await getGenerationJobInternal(id);
  if (!job) return null;
  if (job.userId && job.userId !== userId) return null;
  return toPublicJob(job);
}

export async function assertJobOwnedByUser(id: string, userId: string): Promise<GenerationJob> {
  const job = await getGenerationJobInternal(id);
  if (!job) throw new Error("Generation job not found");
  if (job.userId && job.userId !== userId) throw new Error("Generation job not found");
  return job;
}

export async function claimNextPage(id: string): Promise<GenerationJob | null> {
  const db = await getDb();
  if (!db) throw new Error("The generation database is unavailable");

  // Postgres reports the claimed rows through RETURNING, which keeps the claim
  // atomic: only the caller whose UPDATE matched `processing = false` proceeds.
  const claimed = await db
    .update(generationJobs)
    .set({
      processing: true,
      status: "generating",
      statusMessage: "Preparing the next page...",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(generationJobs.id, id),
        eq(generationJobs.processing, false),
        lt(generationJobs.currentPage, generationJobs.pageCount)
      )
    )
    .returning({ id: generationJobs.id });

  if (claimed.length !== 1) return null;
  return getGenerationJobInternal(id);
}

export async function updateGenerationJob(
  id: string,
  updates: Partial<Pick<GenerationJob, "status" | "statusMessage" | "pdfUrl" | "errorMessage" | "processing">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("The generation database is unavailable");
  await db
    .update(generationJobs)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(generationJobs.id, id));
}

export async function appendPageResult(
  id: string,
  pageResult: GenerationPageResult
): Promise<GenerationJob> {
  const db = await getDb();
  if (!db) throw new Error("The generation database is unavailable");
  const job = await getGenerationJobInternal(id);
  if (!job) throw new Error("Generation job not found");

  const results = [...(job.pageResults ?? []), pageResult];
  await db
    .update(generationJobs)
    .set({
      currentPage: sql`${generationJobs.currentPage} + 1`,
      pageResults: results,
      processing: false,
      statusMessage:
        pageResult.status === "success"
          ? `Generated page ${pageResult.pageNumber} of ${job.pageCount}`
          : `Page ${pageResult.pageNumber} could not be generated; continuing...`,
      updatedAt: new Date(),
    })
    .where(eq(generationJobs.id, id));

  const updated = await getGenerationJobInternal(id);
  if (!updated) throw new Error("Generation job not found after update");
  return updated;
}
