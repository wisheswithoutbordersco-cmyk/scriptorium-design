import sharp from "sharp";
import type { GenerationReferenceImage } from "../drizzle/schema";
import { generateFalImage, type FalAspectRatio } from "./falProvider";
import { generatePublicationImage } from "./openaiImageProvider";

export type CustomerSizePreset =
  | "8.5x11-portrait"
  | "8.5x11-landscape"
  | "11x14"
  | "16x20"
  | "square";

export type CustomerOutputStyle = "full-color" | "coloring";

const REFERENCE_ROLE_INSTRUCTIONS: Record<
  GenerationReferenceImage["role"],
  string
> = {
  overall:
    "Use this as broad visual inspiration, following the user's keep/change instructions.",
  "face-identity":
    "Use this as the face/person identity reference. Preserve recognizable facial features, hair, and likeness when requested; do not copy its background or pose unless asked.",
  "body-pose":
    "Use this as the body, clothing, or pose reference, preserving only the aspects the user's prompt asks to keep.",
  "style-color":
    "Use this for art style, palette, lighting, texture, and visual treatment; do not copy unrelated subjects or layout.",
  "object-scene":
    "Use this for the referenced object, subject, or scene elements, incorporating only what the user's prompt requests.",
};

export function buildReferenceImageInstructions(
  referenceImages: GenerationReferenceImage[]
): string {
  if (referenceImages.length === 0) return "";
  const instructions = referenceImages
    .map(
      (image, index) =>
        `- Reference image ${index + 1}: ${REFERENCE_ROLE_INSTRUCTIONS[image.role]}`
    )
    .join("\n");
  return `\n\nREFERENCE IMAGE GUIDANCE:\nThe uploaded image(s) are visual source material and must be used, not merely mentioned. If the customer's request is vague or only asks to use/improve the image, make the visible subject and distinctive traits in the uploaded reference the primary subject of the page; do not substitute an unrelated subject or generic text-only design. Preserve explicit customer instructions about what to keep or change above all else.\n${instructions}`;
}

const PRINT_POINT_SIZES: Record<CustomerSizePreset, readonly [number, number]> = {
  "8.5x11-portrait": [612, 792],
  "8.5x11-landscape": [792, 612],
  "11x14": [792, 1008],
  "16x20": [1152, 1440],
  square: [720, 720],
};
const CANVAS_LONG_EDGE = 1536;

export function printableCanvasSize(sizePreset: CustomerSizePreset): {
  width: number;
  height: number;
} {
  const [pageWidth, pageHeight] = PRINT_POINT_SIZES[sizePreset];
  const scale = CANVAS_LONG_EDGE / Math.max(pageWidth, pageHeight);
  return {
    width: Math.round(pageWidth * scale),
    height: Math.round(pageHeight * scale),
  };
}

/**
 * Preserve the complete generated page while replacing any aspect-ratio gaps
 * with a blurred, subdued extension of the same artwork instead of white bars.
 */
export async function fitImageToPrintableCanvas(
  image: Buffer,
  sizePreset: CustomerSizePreset
): Promise<Buffer> {
  const { width, height } = printableCanvasSize(sizePreset);
  const metadata = await sharp(image).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("The image provider returned an unreadable page image");
  }

  const background = await sharp(image)
    .resize(width, height, { fit: "cover", position: "centre" })
    .blur(34)
    .modulate({ saturation: 1.15, brightness: 0.88 })
    .flatten({ background: { r: 12, g: 14, b: 20 } })
    .png()
    .toBuffer();
  const foreground = await sharp(image)
    .resize(width, height, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function generateCustomerPageImage(
  imagePrompt: string,
  outputStyle: CustomerOutputStyle,
  aspectRatio: FalAspectRatio,
  sizePreset: CustomerSizePreset,
  referenceImages: GenerationReferenceImage[]
): Promise<Buffer> {
  const hasReferences = referenceImages.length > 0;
  const completePrompt = `${imagePrompt}${buildReferenceImageInstructions(referenceImages)}`;
  const provider = hasReferences
    ? "openai-image-edits"
    : outputStyle === "full-color"
      ? "openai-image-generation"
      : "fal-image-generation";

  // Log only provider and non-content metadata. Never log prompts, image bytes,
  // data URLs, or uploaded file contents.
  console.info("[ImageGen] Provider dispatch", {
    provider,
    referenceCount: referenceImages.length,
    referenceRoles: referenceImages.map(image => image.role),
  });

  let image: Buffer;
  if (hasReferences) {
    // A reference-bearing job always uses the edit endpoint with the original
    // uploaded images. Errors intentionally propagate; never retry as text-only.
    image = await generatePublicationImage(completePrompt, referenceImages);
  } else if (outputStyle === "full-color") {
    image = await generatePublicationImage(completePrompt);
  } else {
    const imageUrl = await generateFalImage(completePrompt, aspectRatio);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Unable to retrieve the generated image (${response.status})`);
    }
    image = Buffer.from(await response.arrayBuffer());
  }

  return fitImageToPrintableCanvas(image, sizePreset);
}
