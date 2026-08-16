import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./Home.tsx", import.meta.url)), "utf8");

describe("customer Quick Create interface", () => {
  it("offers exactly the five approved page-count choices", () => {
    expect(source).toContain("const PAGE_COUNTS = [1, 2, 3, 4, 5] as const");
    expect(source).not.toContain("10, 15, 20");
    expect(source).not.toContain("pageCount: 6");
  });

  it("does not expose operator controls or Replicate quality controls", () => {
    expect(source).not.toContain("Brand Watermark");
    expect(source).not.toContain("Page Numbers");
    expect(source).not.toContain("4× Upscale");
    expect(source).not.toContain("Quality");
    expect(source).not.toContain("Replicate");
  });

  it("submits only the approved public generation payload", () => {
    expect(source).toContain("startMutation.mutate({ prompt: prompt.trim(), outputStyle, sizePreset, pageCount })");
  });
});
