import { describe, expect, it } from "vitest";
import { MIN_DETAILED_PROMPT_LENGTH, PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT } from "./openaiProvider";

describe("GPT-4o publication-grade prompt contract", () => {
  it("requires a significantly expanded, structured production brief", () => {
    expect(MIN_DETAILED_PROMPT_LENGTH).toBeGreaterThanOrEqual(1_100);
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("FORMAT & INTENT");
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("PAGE ARCHITECTURE");
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("CONTENT HIERARCHY & EXACT COPY");
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("TYPOGRAPHY & TEXT-ACCURACY REQUIREMENTS");
  });

  it("preserves educational and informational poster structures", () => {
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("infographic, educational poster, fact sheet, reference page, guide, or informational visual");
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("EXACT TEXT MANIFEST");
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("character-for-character");
  });

  it("locks down customer-safe presentation defaults", () => {
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("Never add branding, a watermark, page numbers, logos, or a signature");
    expect(PUBLISHING_ART_DIRECTOR_SYSTEM_PROMPT).toContain("edge-to-edge finished printable page");
  });
});
