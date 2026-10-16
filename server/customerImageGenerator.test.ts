import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fitImageToPrintableCanvas,
  generateCustomerPageImage,
  printableCanvasSize,
} from "./customerImageGenerator";
import { generateFalImage } from "./falProvider";
import { generatePublicationImage } from "./openaiImageProvider";

vi.mock("./openaiImageProvider", () => ({
  generatePublicationImage: vi.fn(),
}));
vi.mock("./falProvider", () => ({
  generateFalImage: vi.fn(),
}));

const createTestImage = (color = { r: 20, g: 90, b: 220 }) =>
  sharp({
    create: {
      width: 40,
      height: 60,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();

const referenceImages = Array.from({ length: 4 }, (_, index) => ({
  data: Buffer.from(`fixture-${index + 1}`).toString("base64"),
  mimeType: "image/jpeg" as const,
  role: index === 0 ? ("face-identity" as const) : ("overall" as const),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("customer image generation safety and output fit", () => {
  it("routes all references to the image-edit provider with privacy-safe logs", async () => {
    vi.mocked(generatePublicationImage).mockResolvedValue(await createTestImage());
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await generateCustomerPageImage(
      "make it better",
      "coloring",
      "portrait_4_3",
      "8.5x11-portrait",
      referenceImages
    );

    expect(generatePublicationImage).toHaveBeenCalledTimes(1);
    expect(generatePublicationImage).toHaveBeenCalledWith(
      expect.stringContaining("visible subject and distinctive traits"),
      referenceImages
    );
    expect(generateFalImage).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      "[ImageGen] Provider dispatch",
      expect.objectContaining({
        provider: "openai-image-edits",
        referenceCount: 4,
        referenceRoles: ["face-identity", "overall", "overall", "overall"],
      })
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain(referenceImages[0].data);
    expect(JSON.stringify(info.mock.calls)).not.toContain("make it better");
  });

  it("does not retry a failed reference edit as a text-only generation", async () => {
    vi.mocked(generatePublicationImage).mockRejectedValue(
      new Error("mock edit failure")
    );

    await expect(
      generateCustomerPageImage(
        "keep the person in the photo",
        "full-color",
        "portrait_4_3",
        "8.5x11-portrait",
        referenceImages
      )
    ).rejects.toThrow("mock edit failure");

    expect(generatePublicationImage).toHaveBeenCalledTimes(1);
    expect(generateFalImage).not.toHaveBeenCalled();
  });

  it("fits pages to the selected print aspect with blurred, non-white extensions", async () => {
    expect(printableCanvasSize("8.5x11-portrait")).toEqual({
      width: 1187,
      height: 1536,
    });
    expect(printableCanvasSize("8.5x11-landscape")).toEqual({
      width: 1536,
      height: 1187,
    });
    expect(printableCanvasSize("square")).toEqual({
      width: 1536,
      height: 1536,
    });

    const output = await fitImageToPrintableCanvas(
      await createTestImage({ r: 20, g: 90, b: 220 }),
      "square"
    );
    const { data, info } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(1536);
    expect(info.height).toBe(1536);
    const cornerOffset = 0;
    expect(data[cornerOffset]).toBeLessThan(245);
    expect(data[cornerOffset + 2]).toBeGreaterThan(data[cornerOffset]);
  });

  it("keeps text-only full-color routing when no references were supplied", async () => {
    vi.mocked(generatePublicationImage).mockResolvedValue(await createTestImage());

    await generateCustomerPageImage(
      "a vivid garden page",
      "full-color",
      "portrait_4_3",
      "8.5x11-portrait",
      []
    );

    expect(generatePublicationImage).toHaveBeenCalledWith("a vivid garden page");
    expect(generateFalImage).not.toHaveBeenCalled();
  });

  it("keeps no-reference coloring on the FAL route with a mocked download", async () => {
    const image = await createTestImage();
    const imageUrl = "https://mock.invalid/generated-page.png";
    vi.mocked(generateFalImage).mockResolvedValue(imageUrl);
    const mockedFetch = vi.fn<typeof fetch>(async () =>
      new Response(image, { status: 200, headers: { "Content-Type": "image/png" } })
    );
    vi.stubGlobal("fetch", mockedFetch);

    await generateCustomerPageImage(
      "bold outline garden",
      "coloring",
      "square",
      "square",
      []
    );

    expect(generateFalImage).toHaveBeenCalledWith("bold outline garden", "square");
    expect(generatePublicationImage).not.toHaveBeenCalled();
    expect(mockedFetch).toHaveBeenCalledWith(imageUrl);
  });
});
