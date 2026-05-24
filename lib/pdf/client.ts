import { PDFDocument } from "pdf-lib";

/**
 * Read total page count from a PDF buffer. Used by Stage 0 to populate
 * `decks.slide_count` and bound the Pass 1 per-slide loop.
 */
export async function getPageCount(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Extract a single page from a multi-page PDF into a new single-page PDF.
 * Used by Pass 1 to attach one slide at a time to the Anthropic `document`
 * content block.
 *
 * @param pageIndex 0-indexed page number
 */
export async function slicePage(
  buffer: Buffer,
  pageIndex: number,
): Promise<Buffer> {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  if (pageIndex < 0 || pageIndex >= source.getPageCount()) {
    throw new Error(
      `slicePage: pageIndex ${pageIndex} out of range (deck has ${source.getPageCount()} pages)`,
    );
  }
  const target = await PDFDocument.create();
  const [page] = await target.copyPages(source, [pageIndex]);
  target.addPage(page);
  const bytes = await target.save();
  return Buffer.from(bytes);
}

/**
 * Best-effort text-layer extraction per page. Used by Pass 1 as supplementary
 * input alongside the visual page. The prompt explicitly says the text may be
 * "incomplete, scrambled, or empty" — treat as a hint, not truth.
 *
 * Returns array of strings, one per page (1:1 with `getPageCount`). Pages
 * with no text layer (e.g., flattened image-only slides) return empty string.
 *
 * Uses pdfjs-dist's legacy build to avoid worker setup in the Node runtime.
 */
export async function extractTextPerPage(buffer: Buffer): Promise<string[]> {
  // Dynamic import keeps pdfjs out of the main bundle; only loaded when
  // Stage 0 actually runs. pdfjs-dist v5's main bundle ships server-friendly
  // defaults; we just disable the worker so it stays single-threaded.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "";

  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const doc = await pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: unknown) => {
        if (typeof item === "object" && item !== null && "str" in item) {
          const s = (item as { str: unknown }).str;
          return typeof s === "string" ? s : "";
        }
        return "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
    page.cleanup();
  }
  await doc.cleanup();
  await doc.destroy();
  return pages;
}
