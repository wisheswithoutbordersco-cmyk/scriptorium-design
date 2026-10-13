import { describe, expect, it } from "vitest";
import {
  buildReferenceImageInstructions,
  hasUnlimitedGenerationAccess,
  MAX_PAGE_COUNT,
  MAX_REFERENCE_IMAGES,
  normalizeReferenceImages,
  normalizeCustomerOptions,
} from "./generation";

describe("customer Quick Create safeguards", () => {
  it("bypasses free-generation limits only for the direct owner or configured owner ID", () => {
    const priorOwnerId = process.env.OWNER_OPEN_ID;
    process.env.OWNER_OPEN_ID = "configured-clerk-owner";
    try {
      expect(
        hasUnlimitedGenerationAccess("scriptorium:direct-owner", true)
      ).toBe(true);
      expect(hasUnlimitedGenerationAccess("configured-clerk-owner")).toBe(true);
      expect(hasUnlimitedGenerationAccess("customer-123")).toBe(false);
      expect(hasUnlimitedGenerationAccess("unrelated-admin-id")).toBe(false);
    } finally {
      if (priorOwnerId === undefined) delete process.env.OWNER_OPEN_ID;
      else process.env.OWNER_OPEN_ID = priorOwnerId;
    }
  });

  it("allows only 1 through 5 pages", () => {
    expect(MAX_PAGE_COUNT).toBe(5);
    expect(
      normalizeCustomerOptions({
        prompt: "A botanical art page of wildflowers",
        outputStyle: "full-color",
        sizePreset: "8.5x11-portrait",
        pageCount: 5,
      }).pageCount
    ).toBe(5);

    expect(() =>
      normalizeCustomerOptions({
        prompt: "A botanical art page of wildflowers",
        outputStyle: "full-color",
        sizePreset: "8.5x11-portrait",
        pageCount: 6,
      })
    ).toThrow();
  });

  it("accepts up to four valid role-labelled reference images", () => {
    expect(MAX_REFERENCE_IMAGES).toBe(4);
    const referenceImages = Array.from({ length: 4 }, (_, index) => ({
      data: Buffer.from(`reference-${index}`).toString("base64"),
      mimeType: "image/jpeg" as const,
      role: index === 0 ? ("face-identity" as const) : ("overall" as const),
    }));
    expect(
      normalizeCustomerOptions({
        prompt: "A printable scene inspired by my references",
        outputStyle: "full-color",
        sizePreset: "8.5x11-portrait",
        pageCount: 1,
        referenceImages,
      }).referenceImages
    ).toHaveLength(4);
  });

  it("includes the chosen role when building generation guidance", () => {
    const instructions = buildReferenceImageInstructions([
      {
        data: Buffer.from("image").toString("base64"),
        mimeType: "image/jpeg",
        role: "style-color",
      },
    ]);
    expect(instructions).toContain("Reference image 1");
    expect(instructions).toContain("art style, palette, lighting, texture");
  });

  it("rejects excess, malformed, and oversized reference images", () => {
    const base = {
      prompt: "A printable scene inspired by my references",
      outputStyle: "full-color",
      sizePreset: "8.5x11-portrait",
      pageCount: 1,
    } as const;
    const reference = {
      data: Buffer.from("image").toString("base64"),
      mimeType: "image/jpeg" as const,
      role: "overall" as const,
    };
    expect(() =>
      normalizeCustomerOptions({
        ...base,
        referenceImages: Array.from({ length: 5 }, () => reference),
      })
    ).toThrow();
    expect(() =>
      normalizeCustomerOptions({
        ...base,
        referenceImages: [{ ...reference, data: "not base64!" }],
      })
    ).toThrow("valid base64");
    expect(() =>
      normalizeReferenceImages([
        {
          ...reference,
          data: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
        },
      ])
    ).toThrow("smaller than 5 MB");
    expect(() =>
      normalizeCustomerOptions({
        ...base,
        referenceImages: [{ ...reference, role: "unknown" }],
      })
    ).toThrow();
  });

  it("fixes operator-only fields server-side and rejects attempts to submit them", () => {
    const input = {
      prompt: "An outlined garden scene for children to color",
      outputStyle: "coloring" as const,
      sizePreset: "8.5x11-portrait" as const,
      pageCount: 1,
    };
    expect(normalizeCustomerOptions(input)).toMatchObject({
      branding: "none",
      showPageNumbers: false,
      upscale: false,
    });

    expect(() =>
      normalizeCustomerOptions({ ...input, branding: "WWB" })
    ).toThrow();
    expect(() =>
      normalizeCustomerOptions({ ...input, showPageNumbers: true })
    ).toThrow();
    expect(() =>
      normalizeCustomerOptions({ ...input, upscale: true })
    ).toThrow();
  });
});
