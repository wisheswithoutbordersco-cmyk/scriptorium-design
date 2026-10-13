import { describe, expect, it } from "vitest";
import {
  buildPublicationImageEditFormData,
  buildPublicationImageRequest,
  OPENAI_PUBLICATION_IMAGE_MODEL,
  OPENAI_PUBLICATION_RENDER_REQUIREMENTS,
} from "./openaiImageProvider";

describe("publication image model routing", () => {
  it("uses GPT Image 2.5 Sunburst for text-heavy publication pages", () => {
    expect(OPENAI_PUBLICATION_IMAGE_MODEL).toBe("gpt-image-2.5-sunburst");
    expect(buildPublicationImageRequest("A polished ocean page")).toMatchObject(
      {
        model: "gpt-image-2.5-sunburst",
        n: 1,
        quality: "high",
        size: "1024x1536",
      }
    );

    const source = String(OPENAI_PUBLICATION_RENDER_REQUIREMENTS);
    expect(source).toContain("precise text rendering");
    expect(source).toContain("edge-to-edge printable page");
    expect(source).toContain("premium publishing quality");
  });

  it("builds a multipart edit request with all four reference images", () => {
    const referenceImages = Array.from({ length: 4 }, (_, index) => ({
      data: Buffer.from(`image-${index + 1}`).toString("base64"),
      mimeType: "image/jpeg" as const,
      role: "overall" as const,
    }));
    const formData = buildPublicationImageEditFormData(
      "A bright garden printable",
      referenceImages
    );
    const files = formData.getAll("image[]");

    expect(formData.get("model")).toBe("gpt-image-2.5-sunburst");
    expect(formData.get("prompt")).toContain("premium publishing quality");
    expect(files).toHaveLength(4);
    expect((files[0] as File).name).toBe("reference-1.jpg");
    expect((files[3] as File).name).toBe("reference-4.jpg");
    expect((files[0] as Blob).type).toBe("image/jpeg");
  });
});
