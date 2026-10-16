import { z } from "zod";
import { enhancePromptWithGpt4o } from "./openaiProvider";
import {
  buildReferenceImageInstructions,
  generateCustomerPageImage,
} from "./customerImageGenerator";
import type { FalAspectRatio } from "./falProvider";
import { assembleGenerationPdf } from "./generationPdf";
import {
  appendPageResult,
  assertJobOwnedByUser,
  claimNextPage,
  createGenerationJob,
  getGenerationJob,
  getGenerationJobForUser,
  getUserGenerationCount,
  type PublicGenerationJob,
  type StoredGenerationOptions,
  updateGenerationJob,
} from "./generationStore";
import { storagePut } from "./storage";
import type {
  GenerationReferenceImage,
  ReferenceImageRole,
} from "../drizzle/schema";

export const MAX_PAGE_COUNT = 5;
export const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_BASE64_CHARS =
  Math.ceil(MAX_REFERENCE_IMAGE_BYTES / 3) * 4;

const referenceImageRoles = [
  "overall",
  "face-identity",
  "body-pose",
  "style-color",
  "object-scene",
] as const satisfies readonly ReferenceImageRole[];

const sizePresetSchema = z.enum([
  "8.5x11-portrait",
  "8.5x11-landscape",
  "11x14",
  "16x20",
  "square",
]);

/** The public API intentionally contains no branding, page-number, or upscale fields. */
export const customerQuickCreateSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(3, "Please enter a more detailed prompt")
      .max(2_000),
    outputStyle: z.enum(["full-color", "coloring"]),
    sizePreset: sizePresetSchema,
    pageCount: z.number().int().min(1).max(MAX_PAGE_COUNT),
    referenceImages: z
      .array(
        z
          .object({
            data: z.string().min(1).max(MAX_REFERENCE_IMAGE_BASE64_CHARS),
            mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
            role: z.enum(referenceImageRoles),
          })
          .strict()
      )
      .max(MAX_REFERENCE_IMAGES)
      .optional(),
  })
  .strict();

type CustomerQuickCreateInput = z.infer<typeof customerQuickCreateSchema>;

const sizeDefinitions: Record<
  StoredGenerationOptions["sizePreset"],
  { label: string; aspect: FalAspectRatio }
> = {
  "8.5x11-portrait": { label: "8.5×11 inch portrait", aspect: "portrait_4_3" },
  "8.5x11-landscape": {
    label: "8.5×11 inch landscape",
    aspect: "landscape_4_3",
  },
  "11x14": { label: "11×14 inch portrait", aspect: "portrait_4_3" },
  "16x20": { label: "16×20 inch portrait", aspect: "portrait_4_3" },
  square: { label: "10×10 inch square", aspect: "square" },
};

const COLORING_NEGATIVE_PROMPT =
  "No color, no gray tones, no shading, no text, no words, no letters, no numbers, no watermark, no signatures, no blur, no clutter.";

export function normalizeCustomerOptions(
  input: unknown
): StoredGenerationOptions {
  const parsed = customerQuickCreateSchema.parse(input);
  const referenceImages = normalizeReferenceImages(
    parsed.referenceImages ?? []
  );
  return {
    ...parsed,
    referenceImages,
    // Operator-only options are fixed here and are not accepted from the public API.
    branding: "none",
    showPageNumbers: false,
    upscale: false,
  };
}

export function normalizeReferenceImages(
  input: GenerationReferenceImage[]
): GenerationReferenceImage[] {
  let totalBytes = 0;
  return input.map((image, index) => {
    const data = image.data.trim();
    if (data.length > MAX_REFERENCE_IMAGE_BASE64_CHARS) {
      throw new Error(`Each reference image must be smaller than 5 MB`);
    }
    if (!data || data.length % 4 !== 0)
      throw new Error(
        `Reference image ${index + 1} is not valid base64 image data`
      );
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    const decodedSize = (data.length / 4) * 3 - padding;
    if (decodedSize > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(`Each reference image must be smaller than 5 MB`);
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data))
      throw new Error(
        `Reference image ${index + 1} is not valid base64 image data`
      );
    const bytes = Buffer.from(data, "base64");
    if (bytes.length === 0 || bytes.length > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error(`Each reference image must be smaller than 5 MB`);
    }
    if (bytes.toString("base64") !== data)
      throw new Error(
        `Reference image ${index + 1} is not valid base64 image data`
      );
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_REFERENCE_IMAGE_BYTES) {
      throw new Error("Reference images together must be smaller than 16 MB");
    }
    return { ...image, data };
  });
}

export { buildReferenceImageInstructions };

export function fallbackComposition(
  options: StoredGenerationOptions,
  pageIndex: number
): string {
  const size = sizeDefinitions[options.sizePreset];
  const pageContext =
    options.pageCount > 1
      ? `This is page ${pageIndex + 1} of ${options.pageCount}; make it distinct but visually coherent with the other pages.`
      : "Create one complete standalone page.";

  if (options.outputStyle === "coloring") {
    return `Create a detailed black-and-white line-art art page based exactly on this request: ${options.prompt}. ${pageContext} Use a ${size.label} composition with thick, crisp, clean outlines, high-contrast black ink on pure white, open spaces to color, and a clear centered scene. ${COLORING_NEGATIVE_PROMPT}${buildReferenceImageInstructions(options.referenceImages)}`;
  }

  return `Create one complete flat printable art page based exactly on this request: ${options.prompt}. ${pageContext} Use a ${size.label} composition, edge-to-edge artwork, crisp clean details, professional print-ready layout, visibly rich vivid color, clean color separation, sharp focal clarity, luminous directional lighting with dimensional shadows, high contrast, clean spacing, and no watermarks or branding. Do not show a photographed sheet, mockup, border, or paper background.${buildReferenceImageInstructions(options.referenceImages)}`;
}

export async function planPageComposition(
  options: StoredGenerationOptions,
  pageIndex: number
): Promise<string> {
  try {
    return await enhancePromptWithGpt4o({
      prompt: options.prompt,
      outputStyle: options.outputStyle,
      sizeLabel: sizeDefinitions[options.sizePreset].label,
      pageNumber: pageIndex + 1,
      pageCount: options.pageCount,
      referenceRoles: options.referenceImages.map(image => image.role),
    });
  } catch (error) {
    console.warn(
      "GPT-4o prompt enhancement failed; using the reference-aware direct fallback.",
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        referenceCount: options.referenceImages.length,
      }
    );
    return fallbackComposition(options, pageIndex);
  }
}

async function finalizeIfComplete(
  jobId: string
): Promise<PublicGenerationJob | null> {
  const current = await getGenerationJob(jobId);
  if (!current || current.currentPage < current.pageCount) return current;

  const successful = current.pageResults.filter(
    page => page.status === "success"
  );
  if (successful.length === 0) {
    await updateGenerationJob(jobId, {
      status: "error",
      statusMessage: "No pages could be generated",
      errorMessage: "All page-generation attempts failed.",
      referenceImages: null,
    });
    return getGenerationJob(jobId);
  }

  await updateGenerationJob(jobId, {
    status: "assembling",
    statusMessage: "Assembling your PDF...",
    referenceImages: null,
  });
  const assemblyJob = await getGenerationJob(jobId);
  if (!assemblyJob) return null;

  try {
    const pdfUrl = await assembleGenerationPdf(assemblyJob as never);
    const status =
      successful.length === current.pageCount ? "complete" : "partial";
    await updateGenerationJob(jobId, {
      status,
      statusMessage:
        status === "complete"
          ? "Your printable PDF is ready"
          : "Your PDF is ready with completed pages",
      pdfUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF assembly failed";
    await updateGenerationJob(jobId, {
      status: "partial",
      statusMessage: "Pages are ready, but PDF assembly failed",
      errorMessage: message,
    });
  }
  return getGenerationJob(jobId);
}

/** Free tier generation limit. Users without a paid subscription get this many jobs. */
const FREE_TIER_LIMIT = 5;

export function hasUnlimitedGenerationAccess(
  userId: string,
  isDirectOwner = false
): boolean {
  const configuredOwner = process.env.OWNER_OPEN_ID;
  return (
    isDirectOwner || Boolean(configuredOwner && userId === configuredOwner)
  );
}

export function assertReferenceImagesAvailable(
  expectedCount: number,
  referenceImages: GenerationReferenceImage[]
): GenerationReferenceImage[] {
  if (referenceImages.length !== expectedCount) {
    throw new Error(
      "Attached reference image data is unavailable. Please restart this generation."
    );
  }
  return referenceImages;
}

export async function startCustomerGeneration(
  input: CustomerQuickCreateInput,
  /** Clerk user id of the signed-in customer that owns this job. */
  userId: string,
  isDirectOwner = false
): Promise<PublicGenerationJob> {
  // Enforce generation limits (admin/owner bypasses)
  if (!hasUnlimitedGenerationAccess(userId, isDirectOwner)) {
    const count = await getUserGenerationCount(userId);
    if (count >= FREE_TIER_LIMIT) {
      throw new Error(
        `You've used all ${FREE_TIER_LIMIT} free generations. Subscribe to a plan for unlimited access.`
      );
    }
  }
  return createGenerationJob(normalizeCustomerOptions(input), userId);
}

/**
 * Poll-driven job processor: every request claims at most one page. This keeps
 * multi-page work observable and avoids unbounded background execution.
 */
export async function advanceCustomerGeneration(
  jobId: string,
  /** Clerk user id of the signed-in customer; jobs owned by others are rejected. */
  userId: string
): Promise<PublicGenerationJob | null> {
  await assertJobOwnedByUser(jobId, userId);

  const claimed = await claimNextPage(jobId);
  if (!claimed) return finalizeIfComplete(jobId);

  const options: StoredGenerationOptions = {
    prompt: claimed.prompt,
    outputStyle: claimed.outputStyle,
    sizePreset: claimed.sizePreset as StoredGenerationOptions["sizePreset"],
    pageCount: claimed.pageCount,
    branding: "none",
    showPageNumbers: false,
    upscale: false,
    referenceImages: claimed.referenceImages ?? [],
  };
  const pageNumber = claimed.currentPage + 1;

  try {
    options.referenceImages = assertReferenceImagesAvailable(
      claimed.referenceImageCount,
      options.referenceImages
    );
    await updateGenerationJob(jobId, {
      statusMessage: `Generating page ${pageNumber} of ${claimed.pageCount}...`,
    });
    const composition = await planPageComposition(options, claimed.currentPage);
    const png = await generateCustomerPageImage(
      composition,
      options.outputStyle,
      sizeDefinitions[options.sizePreset].aspect,
      options.sizePreset,
      options.referenceImages
    );
    const { url: imageUrl } = await storagePut(
      `generated/${jobId}/page-${String(pageNumber).padStart(3, "0")}.png`,
      png,
      "image/png"
    );
    await appendPageResult(jobId, { pageNumber, imageUrl, status: "success" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image generation failed";
    console.error(`Generation failed for page ${pageNumber}`, {
      errorName: error instanceof Error ? error.name : "UnknownError",
      referenceCount: options.referenceImages.length,
    });
    await appendPageResult(jobId, {
      pageNumber,
      imageUrl: "",
      status: "error",
      error: message,
    });
  }

  return finalizeIfComplete(jobId);
}

export async function getCustomerGeneration(
  jobId: string,
  /** Clerk user id of the signed-in customer; jobs owned by others are hidden. */
  userId: string
): Promise<PublicGenerationJob | null> {
  return getGenerationJobForUser(jobId, userId);
}
