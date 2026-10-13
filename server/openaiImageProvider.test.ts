import { describe, expect, it } from "vitest";
import {
  buildPublicationImageRequest,
  OPENAI_PUBLICATION_IMAGE_MODEL,
  OPENAI_PUBLICATION_RENDER_REQUIREMENTS,
} from "./openaiImageProvider";

describe("publication image model routing", () => {
  it("uses GPT Image 2.5 Sunburst for text-heavy publication pages", () => {
    expect(OPENAI_PUBLICATION_IMAGE_MODEL).toBe("gpt-image-2.5-sunburst");
    expect(buildPublicationImageRequest("A polished ocean page")).toMatchObject({
      model: "gpt-image-2.5-sunburst",
      n: 1,
      quality: "high",
      size: "1024x1536",
    });

    const source = String(OPENAI_PUBLICATION_RENDER_REQUIREMENTS);
    expect(source).toContain("precise text rendering");
    expect(source).toContain("edge-to-edge printable page");
    expect(source).toContain("premium publishing quality");
  });
});
