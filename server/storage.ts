// Storage helpers using Supabase Storage directly
// Replaces Manus Forge storage for Railway deployment

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.BUILT_IN_FORGE_API_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.BUILT_IN_FORGE_API_KEY || "";
const BUCKET = "production-studio";

function getConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Storage config missing: set SUPABASE_URL and SUPABASE_SERVICE_KEY (or BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY)");
  }
  return { url: SUPABASE_URL.replace(/\/+$/, ""), key: SUPABASE_KEY };
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { url, key: apiKey } = getConfig();
  const finalKey = appendHashSuffix(relKey.replace(/^\/+/, ""));

  // Upload to Supabase Storage
  const uploadUrl = `${url}/storage/v1/object/${BUCKET}/${finalKey}`;
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const resp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: blob,
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage upload failed (${resp.status}): ${msg}`);
  }

  // Return public URL
  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${finalKey}`;
  return { key: finalKey, url: publicUrl };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const { url } = getConfig();
  const key = relKey.replace(/^\/+/, "");
  return { key, url: `${url}/storage/v1/object/public/${BUCKET}/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { url } = getConfig();
  const key = relKey.replace(/^\/+/, "");
  return `${url}/storage/v1/object/public/${BUCKET}/${key}`;
}
