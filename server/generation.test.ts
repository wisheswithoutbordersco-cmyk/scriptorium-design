import { describe, expect, it } from "vitest";
import { hasUnlimitedGenerationAccess, MAX_PAGE_COUNT, normalizeCustomerOptions } from "./generation";

describe("customer Quick Create safeguards", () => {
  it("bypasses free-generation limits only for the direct owner or configured owner ID", () => {
    const priorOwnerId = process.env.OWNER_OPEN_ID;
    process.env.OWNER_OPEN_ID = "configured-clerk-owner";
    try {
      expect(hasUnlimitedGenerationAccess("scriptorium:direct-owner", true)).toBe(true);
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
    expect(normalizeCustomerOptions({
      prompt: "A botanical art page of wildflowers",
      outputStyle: "full-color",
      sizePreset: "8.5x11-portrait",
      pageCount: 5,
    }).pageCount).toBe(5);

    expect(() => normalizeCustomerOptions({
      prompt: "A botanical art page of wildflowers",
      outputStyle: "full-color",
      sizePreset: "8.5x11-portrait",
      pageCount: 6,
    })).toThrow();
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

    expect(() => normalizeCustomerOptions({ ...input, branding: "WWB" })).toThrow();
    expect(() => normalizeCustomerOptions({ ...input, showPageNumbers: true })).toThrow();
    expect(() => normalizeCustomerOptions({ ...input, upscale: true })).toThrow();
  });
});
