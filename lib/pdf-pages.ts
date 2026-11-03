// Opens an uploaded PDF or image in the browser and draws its pages, so the user can pick the pages to
// read and the app can check them before anything leaves the device. pdf.js is loaded only when needed.

export type PageSource = {
  kind: 'pdf' | 'image';
  pageCount: number;
  /** Draws page `index` (0-based) so that its longer side is at most `maxSide` px. */
  render: (index: number, maxSide: number) => Promise<HTMLCanvasElement>;
  close: () => void;
};

export class PageSourceError extends Error {
  constructor(public code: 'corrupt' | 'encrypted' | 'too_many_pages' | 'too_small') { super(code); }
}

export const MAX_PDF_PAGES = 30;

async function openPdf(bytes: Uint8Array): Promise<PageSource> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  let doc;
  try {
    // A copy: pdf.js transfers the buffer to its worker. No scripting, no fonts or files from the network.
    doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, enableXfa: false }).promise;
  } catch (error) {
    throw new PageSourceError((error as { name?: string })?.name === 'PasswordException' ? 'encrypted' : 'corrupt');
  }
  if (doc.numPages > MAX_PDF_PAGES) { void doc.destroy(); throw new PageSourceError('too_many_pages'); }
  return {
    kind: 'pdf',
    pageCount: doc.numPages,
    async render(index, maxSide) {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      page.cleanup();
      return canvas;
    },
    close: () => { void doc.destroy(); },
  };
}

async function openImage(bytes: Uint8Array, type: string): Promise<PageSource> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes.slice()], { type })); } catch { throw new PageSourceError('corrupt'); }
  return {
    kind: 'image',
    pageCount: 1,
    async render(_index, maxSide) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    },
    close: () => bitmap.close(),
  };
}

export function openPages(bytes: Uint8Array, kind: 'pdf' | 'png' | 'jpeg'): Promise<PageSource> {
  return kind === 'pdf' ? openPdf(bytes) : openImage(bytes, kind === 'png' ? 'image/png' : 'image/jpeg');
}

/** The pixels of a drawn page as gray levels, for the staff-line check. */
export function canvasGray(canvas: HTMLCanvasElement): { gray: Uint8ClampedArray; width: number; height: number } {
  const { width, height } = canvas;
  const rgba = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  return { gray, width, height };
}

/** A page image for the recognition job: JPEG, longer side `maxSide`. */
export function canvasJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PageSourceError('corrupt'))), 'image/jpeg', quality));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
