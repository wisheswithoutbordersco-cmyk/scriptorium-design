import { describe, expect, it, vi } from "vitest";
import {
  buildPublicationImageEditFormData,
  buildPublicationImageRequest,
  generatePublicationImage,
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

  it("sends every reference to the edit provider and logs no image data", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "unit-test-key";
    const referenceImages = Array.from({ length: 4 }, (_, index) => ({
      data: Buffer.from(`private-reference-${index + 1}`).toString("base64"),
      mimeType: "image/jpeg" as const,
      role: "overall" as const,
    }));
    const mockedFetch = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("mock-png").toString("base64") }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("fetch", mockedFetch);
    try {
      await generatePublicationImage("private prompt", referenceImages);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const requestInit = mockedFetch.mock.calls[0]?.[1];
      const body = requestInit?.body;
      expect(body).toBeInstanceOf(FormData);
      const files = (body as FormData).getAll("image[]") as File[];
      expect(files).toHaveLength(4);
      expect(Buffer.from(await files[2].arrayBuffer()).toString()).toBe(
        "private-reference-3"
      );
      expect(info).toHaveBeenCalledWith(
        "[ImageGen] Provider request",
        expect.objectContaining({
          provider: "openai-image-edits",
          referencesAttached: true,
          referenceCount: 4,
        })
      );
      expect(JSON.stringify(info.mock.calls)).not.toContain(referenceImages[0].data);
    } finally {
      vi.unstubAllGlobals();
      info.mockRestore();
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it("does not write provider error text or image content to logs", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "unit-test-key";
    const secretLikeText = "private-reference-leak-check";
    const mockedFetch = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          error: {
            message: `Provider rejected input near ${secretLikeText}`,
            code: "invalid_request_error",
            type: "invalid_request_error",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", mockedFetch);
    try {
      await expect(
        generatePublicationImage("private prompt", [
          {
            data: Buffer.from(secretLikeText).toString("base64"),
            mimeType: "image/jpeg",
            role: "overall",
          },
        ])
      ).rejects.toThrow(secretLikeText);
      expect(errorLog).toHaveBeenCalledWith(
        "[ImageGen] OpenAI request failed",
        expect.objectContaining({
          status: 400,
          errorCode: "invalid_request_error",
          referenceCount: 1,
        })
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(secretLikeText);
    } finally {
      vi.unstubAllGlobals();
      errorLog.mockRestore();
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
