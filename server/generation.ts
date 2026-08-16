import sharp from "sharp";
import { z } from "zod";
import { enhancePromptWithGpt4o } from "./openaiProvider";
import { generatePublicationImage } from "./openaiImageProvider";
import { generateFalImage, type FalAspectRatio } from "./falProvider";
import { assembleGenerationPdf } from "./generationPdf";
import {
  appendPageResult,
  claimNextPage,
  createGenerationJob,
  getGenerationJob,
  type PublicGenerationJob,
  type StoredGenerationOptions,
  updateGenerationJob,
} from "./generationStore";
import { storagePut } from "./storage";

export const MAX_PAGE_COUNT = 5;

const sizePresetSchema = z.enum([
  "8.5x11-portrait",
  "8.5x11-landscape",
  "11x14",
  "16x20",
  "square",
]);

/** The public API intentionally contains no branding, page-number, or upscale fields. */
export const customerQuickCreateSchema = z.object({
  prompt: z.string().trim().min(3, "Please enter a more detailed prompt").max(2_000),
  outputStyle: z.enum(["full-color", "coloring"]),
  sizePreset: sizePresetSchema,
  pageCount: z.number().int().min(1).max(MAX_PAGE_COUNT),
}).strict();

type CustomerQuickCreateInput = z.infer<typeof customerQuickCreateSchema>;

const sizeDefinitions: Record<StoredGenerationOptions["sizePreset"], { label: string; aspect: FalAspectRatio }> = {
  "8.5x11-portrait": { label: "8.5×11 inch portrait", aspect: "portrait_4_3" },
  "8.5x11-landscape": { label: "8.5×11 inch landscape", aspect: "landscape_4_3" },
  "11x14": { label: "11×14 inch portrait", aspect: "portrait_4_3" },
  "16x20": { label: "16×20 inch portrait", aspect: "portrait_4_3" },
  square: { label: "10×10 inch square", aspect: "square" },
};

const COLORING_NEGATIVE_PROMPT = "No color, no gray tones, no shading, no text, no words, no letters, no numbers, no watermark, no signatures, no blur, no clutter.";

export function normalizeCustomerOptions(input: unknown): StoredGenerationOptions {
  const parsed = customerQuickCreateSchema.parse(input);
  return {
    ...parsed,
    // Operator-only options are fixed here and are not accepted from the public API.
    branding: "none",
    showPageNumbers: false,
    upscale: false,
  };
}

function fallbackComposition(options: StoredGenerationOptions, pageIndex: number): string {
  const size = sizeDefinitions[options.sizePreset];
  const pageContext = options.pageCount > 1
    ? `This is page ${pageIndex + 1} of ${options.pageCount}; make it distinct but visually coherent with the other pages.`
    : "Create one complete standalone page.";

  if (options.outputStyle === "coloring") {
    return `Create a detailed black-and-white line-art art page based exactly on this request: ${options.prompt}. ${pageContext} Use a ${size.label} composition with thick, crisp, clean outlines, high-contrast black ink on pure white, open spaces to color, and a clear centered scene. ${COLORING_NEGATIVE_PROMPT}`;
  }

  return `Create one complete flat printable art page based exactly on this request: ${options.prompt}. ${pageContext} Use a ${size.label} composition, edge-to-edge artwork, crisp clean details, professional print-ready layout, rich vivid color, high contrast, clean spacing, and no watermarks or branding. Do not show a photographed sheet, mockup, border, or paper background.`;
}

async function planPageComposition(options: StoredGenerationOptions, pageIndex: number): Promise<string> {
  try {
    return await enhancePromptWithGpt4o({
      prompt: options.prompt,
      outputStyle: options.outputStyle,
      sizeLabel: sizeDefinitions[options.sizePreset].label,
      pageNumber: pageIndex + 1,
      pageCount: options.pageCount,
    });
  } catch (error) {
    console.warn("GPT-4o prompt enhancement failed; using the direct prompt:", error);
    return fallbackComposition(options, pageIndex);
  }
}

async function downloadAsPng(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to retrieve the generated image (${response.status})`);
  const source = Buffer.from(await response.arrayBuffer());
  return sharp(source).png({ compressionLevel: 9 }).toBuffer();
}

async function generateCustomerPageImage(
  imagePrompt: string,
  outputStyle: StoredGenerationOptions["outputStyle"],
  aspectRatio: FalAspectRatio
): Promise<Buffer> {
  // This mirrors Railway Quick Create: GPT Image 2 carries text-heavy, full-color
  // publications, while FAL handles the high-contrast coloring-page route.
  if (outputStyle === "full-color") return generatePublicationImage(imagePrompt);
  const falUrl = await generateFalImage(imagePrompt, aspectRatio);
  return downloadAsPng(falUrl);
}

async function finalizeIfComplete(jobId: string): Promise<PublicGenerationJob | null> {
  const current = await getGenerationJob(jobId);
  if (!current || current.currentPage < current.pageCount) return current;

  const successful = current.pageResults.filter(page => page.status === "success");
  if (successful.length === 0) {
    await updateGenerationJob(jobId, { status: "error", statusMessage: "No pages could be generated", errorMessage: "All page-generation attempts failed." });
    return getGenerationJob(jobId);
  }

  await updateGenerationJob(jobId, { status: "assembling", statusMessage: "Assembling your PDF..." });
  const assemblyJob = await getGenerationJob(jobId);
  if (!assemblyJob) return null;

  try {
    const pdfUrl = await assembleGenerationPdf(assemblyJob as never);
    const status = successful.length === current.pageCount ? "complete" : "partial";
    await updateGenerationJob(jobId, {
      status,
      statusMessage: status === "complete" ? "Your printable PDF is ready" : "Your PDF is ready with completed pages",
      pdfUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF assembly failed";
    await updateGenerationJob(jobId, { status: "partial", statusMessage: "Pages are ready, but PDF assembly failed", errorMessage: message });
  }
  return getGenerationJob(jobId);
}

export async function startCustomerGeneration(input: CustomerQuickCreateInput): Promise<PublicGenerationJob> {
  return createGenerationJob(normalizeCustomerOptions(input));
}

/**
 * Poll-driven job processor: every request claims at most one page. This keeps
 * multi-page work observable and avoids unbounded background execution.
 */
export async function advanceCustomerGeneration(jobId: string): Promise<PublicGenerationJob | null> {
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
  };
  const pageNumber = claimed.currentPage + 1;

  try {
    await updateGenerationJob(jobId, { statusMessage: `Generating page ${pageNumber} of ${claimed.pageCount}...` });
    const composition = await planPageComposition(options, claimed.currentPage);
    const png = await generateCustomerPageImage(
      composition,
      options.outputStyle,
      sizeDefinitions[options.sizePreset].aspect
    );
    const { url: imageUrl } = await storagePut(`generated/${jobId}/page-${String(pageNumber).padStart(3, "0")}.png`, png, "image/png");
    await appendPageResult(jobId, { pageNumber, imageUrl, status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed";
    console.error(`Generation failed for page ${pageNumber}:`, message);
    await appendPageResult(jobId, { pageNumber, imageUrl: "", status: "error", error: message });
  }

  return finalizeIfComplete(jobId);
}

export async function getCustomerGeneration(jobId: string): Promise<PublicGenerationJob | null> {
  return getGenerationJob(jobId);
}
