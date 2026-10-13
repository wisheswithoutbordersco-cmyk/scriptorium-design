import type { GenerationReferenceImage } from "../drizzle/schema";

const OPENAI_IMAGES_ENDPOINT = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGE_EDITS_ENDPOINT = "https://api.openai.com/v1/images/edits";
export const OPENAI_PUBLICATION_IMAGE_MODEL = "gpt-image-2.5-sunburst";

const OPENAI_PUBLICATION_RENDER_REQUIREMENTS = `RENDER QUALITY REQUIREMENTS: Create one complete edge-to-edge printable page, never a photographed paper, mockup, frame, or page on a background. Use premium publishing quality, crisp clean edges, strong contrast, precise text rendering, clearly separated content groups, refined detail, and professional print-ready composition. For full-color artwork, use a bold saturated vivid palette with rich clean color separation. Avoid beige, cream, muted earth tones, dusty, desaturated, washed-out, or soft pastel treatments unless explicitly requested.`;

export function buildPublicationImageRequest(prompt: string) {
  return {
    model: OPENAI_PUBLICATION_IMAGE_MODEL,
    prompt: `${prompt}\n\n${OPENAI_PUBLICATION_RENDER_REQUIREMENTS}`,
    n: 1,
    quality: "high" as const,
    size: "1024x1536" as const,
  };
}

export function buildPublicationImageEditFormData(
  prompt: string,
  referenceImages: GenerationReferenceImage[]
): FormData {
  const formData = new FormData();
  formData.set("model", OPENAI_PUBLICATION_IMAGE_MODEL);
  formData.set(
    "prompt",
    `${prompt}\n\n${OPENAI_PUBLICATION_RENDER_REQUIREMENTS}`
  );
  formData.set("n", "1");
  formData.set("quality", "high");
  formData.set("size", "1024x1536");
  formData.set("background", "opaque");
  formData.set("output_format", "png");

  referenceImages.forEach((image, index) => {
    const extension =
      image.mimeType === "image/png"
        ? "png"
        : image.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const bytes = Buffer.from(image.data, "base64");
    formData.append(
      "image[]",
      new Blob([new Uint8Array(bytes)], { type: image.mimeType }),
      `reference-${index + 1}.${extension}`
    );
  });

  return formData;
}

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OpenAI image generation is not configured");
  return key;
}

export async function generatePublicationImage(
  prompt: string,
  referenceImages: GenerationReferenceImage[] = []
): Promise<Buffer> {
  const hasReferences = referenceImages.length > 0;
  const response = await fetch(
    hasReferences ? OPENAI_IMAGE_EDITS_ENDPOINT : OPENAI_IMAGES_ENDPOINT,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAIKey()}`,
        ...(hasReferences ? {} : { "Content-Type": "application/json" }),
      },
      body: hasReferences
        ? buildPublicationImageEditFormData(prompt, referenceImages)
        : JSON.stringify(buildPublicationImageRequest(prompt)),
    }
  );

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string; code?: string; type?: string };
  };
  if (!response.ok) {
    console.error("[ImageGen] OpenAI error:", JSON.stringify(payload.error));
    throw new Error(
      `OpenAI publication image generation failed (${response.status}): ${payload.error?.message ?? "unknown error"}`
    );
  }

  const imageData = payload.data?.[0];
  if (!imageData) throw new Error("OpenAI returned no publication image data");

  if (imageData.b64_json) return Buffer.from(imageData.b64_json, "base64");

  if (imageData.url) {
    const imgResponse = await fetch(imageData.url);
    if (!imgResponse.ok)
      throw new Error("Failed to download generated image from URL");
    return Buffer.from(await imgResponse.arrayBuffer());
  }

  throw new Error("OpenAI returned neither b64_json nor url for the image");
}

export { OPENAI_PUBLICATION_RENDER_REQUIREMENTS };
