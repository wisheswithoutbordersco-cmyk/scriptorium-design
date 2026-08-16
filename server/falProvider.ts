const FAL_SYNC_ENDPOINT = "https://fal.run/fal-ai/flux-pro/v1.1-ultra";

export const FAL_MODEL_ENDPOINT = "fal-ai/flux-pro/v1.1-ultra";

export type FalAspectRatio = "portrait_4_3" | "landscape_4_3" | "square";

type FalImageResponse = {
  images?: Array<{ url?: string }>;
  image?: { url?: string };
  detail?: unknown;
};

function getFalKey(): string {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL image generation is not configured");
  return key;
}

function getAuthorizationHeaders(): HeadersInit {
  return {
    Authorization: `Key ${getFalKey()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Checks that a configured key is accepted without submitting a billable image
 * request. FAL validates credentials before rejecting the deliberately empty
 * payload as a 4xx validation response.
 */
export async function validateFalKey(): Promise<boolean> {
  const response = await fetch(FAL_SYNC_ENDPOINT, {
    method: "POST",
    headers: getAuthorizationHeaders(),
    body: JSON.stringify({}),
  });

  if (response.status === 401 || response.status === 403) return false;
  return response.status >= 200 && response.status < 500;
}

export async function generateFalImage(
  prompt: string,
  aspectRatio: FalAspectRatio
): Promise<string> {
  const response = await fetch(FAL_SYNC_ENDPOINT, {
    method: "POST",
    headers: getAuthorizationHeaders(),
    body: JSON.stringify({
      prompt,
      image_size: aspectRatio,
      num_images: 1,
      enable_prompt_expansion: false,
      enable_safety_checker: true,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as FalImageResponse;
  if (!response.ok) {
    throw new Error(`FAL generation failed (${response.status}): ${JSON.stringify(payload.detail ?? payload)}`);
  }

  const imageUrl = payload.images?.[0]?.url ?? payload.image?.url;
  if (!imageUrl) throw new Error("FAL did not return an image URL");
  return imageUrl;
}
