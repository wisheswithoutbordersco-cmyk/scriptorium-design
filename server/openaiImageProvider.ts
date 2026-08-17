const OPENAI_IMAGES_ENDPOINT = "https://api.openai.com/v1/images/generations";

const OPENAI_PUBLICATION_RENDER_REQUIREMENTS = `RENDER QUALITY REQUIREMENTS: Create one complete edge-to-edge printable page, never a photographed paper, mockup, frame, or page on a background. Use premium publishing quality, crisp clean edges, strong contrast, precise text rendering, clearly separated content groups, refined detail, and professional print-ready composition. For full-color artwork, use a bold saturated vivid palette with rich clean color separation. Avoid beige, cream, muted earth tones, dusty, desaturated, washed-out, or soft pastel treatments unless explicitly requested.`;

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OpenAI image generation is not configured");
  return key;
}

export async function generatePublicationImage(prompt: string): Promise<Buffer> {
  const response = await fetch(OPENAI_IMAGES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: `${prompt}\n\n${OPENAI_PUBLICATION_RENDER_REQUIREMENTS}`,
      n: 1,
      quality: "high",
      size: "1024x1536",
    }),
  });

  const payload = await response.json().catch(() => ({})) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string; code?: string; type?: string };
  };
  if (!response.ok) {
    console.error("[ImageGen] OpenAI error:", JSON.stringify(payload.error));
    throw new Error(`OpenAI publication image generation failed (${response.status}): ${payload.error?.message ?? "unknown error"}`);
  }

  const imageData = payload.data?.[0];
  if (!imageData) throw new Error("OpenAI returned no publication image data");

  // gpt-image-1 returns b64_json by default
  if (imageData.b64_json) {
    return Buffer.from(imageData.b64_json, "base64");
  }

  // Fallback: if URL is returned, download the image
  if (imageData.url) {
    const imgResponse = await fetch(imageData.url);
    if (!imgResponse.ok) throw new Error("Failed to download generated image from URL");
    const arrayBuffer = await imgResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("OpenAI returned neither b64_json nor url for the image");
}

export { OPENAI_PUBLICATION_RENDER_REQUIREMENTS };
