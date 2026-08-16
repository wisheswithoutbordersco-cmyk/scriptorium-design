import PDFDocument from "pdfkit";
import type { GenerationJob } from "../drizzle/schema";
import { storageGetSignedUrl, storagePut } from "./storage";

const PDF_SIZES = {
  "8.5x11-portrait": [612, 792],
  "8.5x11-landscape": [792, 612],
  "11x14": [792, 1008],
  "16x20": [1152, 1440],
  square: [720, 720],
} as const;

function toBuffer(document: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download generated page (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

function storagePathFromPublicUrl(url: string): string {
  const prefix = "/manus-storage/";
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}

export async function assembleGenerationPdf(job: GenerationJob): Promise<string> {
  const successfulPages = (job.pageResults ?? []).filter(page => page.status === "success" && page.imageUrl);
  if (successfulPages.length === 0) throw new Error("No completed pages are available for PDF assembly");

  const size = PDF_SIZES[job.sizePreset as keyof typeof PDF_SIZES] ?? PDF_SIZES["8.5x11-portrait"];
  const document = new PDFDocument({ autoFirstPage: false, margin: 0, compress: true });
  const pdfBufferPromise = toBuffer(document);

  for (const page of successfulPages) {
    const signedUrl = await storageGetSignedUrl(storagePathFromPublicUrl(page.imageUrl));
    const image = await downloadImage(signedUrl);
    document.addPage({ size: [...size], margin: 0 });
    document.image(image, 0, 0, { width: size[0], height: size[1] });
  }

  document.end();
  const pdfBuffer = await pdfBufferPromise;
  const { url } = await storagePut(`generated/${job.id}/${job.filename}`, pdfBuffer, "application/pdf");
  return url;
}
