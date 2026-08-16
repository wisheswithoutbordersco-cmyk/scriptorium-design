import { describe, expect, it } from "vitest";

const OPENAI_MODELS_ENDPOINT = "https://api.openai.com/v1/models";

describe("OpenAI prompt-enhancement credentials", () => {
  it("accepts the configured OpenAI key on the models endpoint", async () => {
    const key = process.env.OPENAI_API_KEY?.trim();
    expect(key).toBeTruthy();

    const response = await fetch(OPENAI_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(200);
  }, 20_000);
});

export { OPENAI_MODELS_ENDPOINT };

// The provider is intentionally server-side only. The browser never imports this file.
// GPT-4o prompt enhancement is wired in server/generation.ts.

