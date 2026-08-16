import { describe, expect, it } from "vitest";
import { OPENAI_PUBLICATION_RENDER_REQUIREMENTS } from "./openaiImageProvider";

describe("publication image model routing", () => {
  it("uses GPT Image 2 requirements for text-heavy publication pages", () => {
    const source = String(OPENAI_PUBLICATION_RENDER_REQUIREMENTS);
    expect(source).toContain("precise text rendering");
    expect(source).toContain("edge-to-edge printable page");
    expect(source).toContain("premium publishing quality");
  });
});
