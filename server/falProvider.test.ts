import { describe, expect, it } from "vitest";
import { FAL_MODEL_ENDPOINT, validateFalKey } from "./falProvider";

describe("FAL provider configuration", () => {
  it("uses the FAL-only publication-grade Flux Pro Ultra endpoint", () => {
    expect(FAL_MODEL_ENDPOINT).toBe("fal-ai/flux-pro/v1.1-ultra");
  });

  it("accepts the configured FAL key with a non-billable validation request", async () => {
    await expect(validateFalKey()).resolves.toBe(true);
  }, 20_000);
});
