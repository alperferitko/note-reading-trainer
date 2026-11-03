// Checks a user upload before anything is sent anywhere. Only bytes and pixels are measured:
// text inside a file is never interpreted, never echoed and never followed as an instruction.
// Every rejection carries a stable code and a short explanation in Turkish and English.
// The staff-line detector is a gate, not a judge: "not_score" only when nothing staff-like is found,
// "unclear" sends the file to a person, and no answer is ever stated as a certainty or a percentage.

import { MAX_FILE_BYTES as MAX_MUSICXML_BYTES } from './musicxml.mjs';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 30;
export const MIN_SHORT_SIDE = 600;
export const MAX_IMAGE_SIDE = 12000;

/** @typedef {'pdf'|'png'|'jpeg'|'mxl'|'musicxml'} UploadType */
/** @typedef {{tr:string, en:string}} Message */

/** @type {Record<UploadType, {mime:string, extensions:string[]}>} */
export const UPLOAD_TYPES = {
  pdf: { mime: 'application/pdf', extensions: ['pdf'] },
  png: { mime: 'image/png', extensions: ['png'] },
  jpeg: { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  mxl: { mime: 'application/vnd.recordare.musicxml', extensions: ['mxl'] },
  musicxml: { mime: 'application/vnd.recordare.musicxml+xml', extensions: ['musicxml', 'xml'] },
};

/** @type {Record<string, Message>} */
const MESSAGES = {
  empty: { tr: 'Dosya boş.', en: 'The file is empty.' },
  too_large: { tr: 'Dosya çok büyük. En fazla 20 MB yükleyebilirsiniz (MusicXML için 2 MB).', en: 'The file is too large. The limit is 20 MB (2 MB for MusicXML).' },
  unsupported_type: { tr: 'Bu dosya türü desteklenmiyor. PDF, PNG, JPEG, MusicXML ya da MXL yükleyin.', en: 'This file type is not supported. Upload a PDF, PNG, JPEG, MusicXML or MXL file.' },
  type_mismatch: { tr: 'Dosyanın uzantısı içeriğiyle uyuşmuyor. Dosyayı doğru uzantıyla yeniden kaydedin.', en: 'The file extension does not match its contents. Save the file again with the right extension.' },
  corrupt: { tr: 'Dosya bozuk ya da eksik görünüyor.', en: 'The file looks damaged or incomplete.' },
  encrypted: { tr: 'PDF parola korumalı. Korumasız bir kopya yükleyin.', en: 'The PDF is password-protected. Upload an unprotected copy.' },
  too_many_pages: { tr: 'PDF en fazla 30 sayfa olabilir. Çalışmak istediğiniz sayfaları ayrı bir dosyaya alın.', en: 'A PDF can have at most 30 pages. Put the pages you want to practise into a separate file.' },
  too_small: { tr: 'Görüntü çok küçük (kısa kenar en az 600 piksel olmalı). Porte çizgileri ve notalar ancak yeterli çözünürlükte ayırt edilebilir.', en: 'The image is too small (the short side must be at least 600 pixels). Staff lines and noteheads can only be told apart at a sufficient resolution.' },
  too_big_dimensions: { tr: 'Görüntünün bir kenarı 12000 pikselden uzun. Daha küçük bir boyutta kaydedin.', en: 'One side of the image is longer than 12000 pixels. Save it at a smaller size.' },
};

/** @param {string|null} code */
const messageFor = code => (code ? MESSAGES[code] ?? null : null);

/** @param {Uint8Array|ArrayBuffer|ArrayLike<number>} bytes @returns {Uint8Array} */
function asBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes && typeof bytes.length === 'number') return Uint8Array.from(bytes);
  throw new TypeError('bytes_required');
}

/** @param {string} name @returns {string|null} lower-case extension without the dot */
export function extensionOf(name) {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(base);
  return m ? m[1].toLowerCase() : null;
}

/** @param {Uint8Array} data @param {number[]} sig @param {number} [at] */
const startsWith = (data, sig, at = 0) => data.length >= at + sig.length && sig.every((b, i) => data[at + i] === b);

/** Bytes as a string with one char per byte (latin1), for scanning ASCII structure only. */
function latin1(data, from = 0, to = data.length) {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = from; i < to; i += CHUNK) out += String.fromCharCode.apply(null, Array.from(data.subarray(i, Math.min(to, i + CHUNK))));
  return out;
}

/** @param {Uint8Array} data @param {string} needle */
function containsAscii(data, needle) {
  const first = needle.charCodeAt(0);
  outer: for (let i = data.indexOf(first); i !== -1 && i <= data.length - needle.length; i = data.indexOf(first, i + 1)) {
    for (let j = 1; j < needle.length; j++) if (data[i + j] !== needle.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SCORE_ROOT = /<(score-partwise|score-timewise)[\s>/]/;

/** The first characters of a text file, or null when the bytes are not text. */
function textHead(data, limit) {
  const slice = data.subarray(0, Math.min(data.length, limit));
  let encoding = 'utf-8'; let offset = 0;
  if (startsWith(slice, [0xef, 0xbb, 0xbf])) offset = 3;
  else if (startsWith(slice, [0xff, 0xfe])) { encoding = 'utf-16le'; offset = 2; }
  else if (startsWith(slice, [0xfe, 0xff])) { encoding = 'utf-16be'; offset = 2; }
  const body = slice.subarray(offset);
  if (encoding === 'utf-8' && body.includes(0)) return null;
  try { return new TextDecoder(encoding, { fatal: false }).decode(body); } catch { return null; }
}

/**
 * The real type of the bytes, decided by magic numbers and never by the name.
 * @param {Uint8Array} data
 * @returns {{type: UploadType|null, corrupt?: boolean, variant?: string}}
 */
function detect(data) {
  if (containsAscii(data.subarray(0, 1024), '%PDF-')) {
    const tail = data.subarray(Math.max(0, data.length - 2048));
    return { type: 'pdf', corrupt: !containsAscii(tail, '%%EOF') };
  }
  if (startsWith(data, PNG_SIG)) {
    const ihdr = data.length >= 33 && startsWith(data, [0x49, 0x48, 0x44, 0x52], 12);
    return { type: 'png', corrupt: !ihdr };
  }
  if (startsWith(data, [0xff, 0xd8, 0xff])) return { type: 'jpeg', corrupt: data.length < 4 };
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
    // A compressed MusicXML file is a ZIP whose entry names (stored uncompressed) include the container.
    return containsAscii(data, 'META-INF/container.xml') ? { type: 'mxl' } : { type: null, variant: 'zip' };
  }
  const head = textHead(data, 64 * 1024);
  if (head !== null && head.trimStart().startsWith('<')) {
    const root = SCORE_ROOT.exec(head);
    if (root) return { type: 'musicxml', variant: root[1] === 'score-timewise' ? 'timewise' : 'partwise' };
  }
  return { type: null };
}

/**
 * @typedef {{ok:boolean, code:string|null, type:UploadType|null, mime:string|null, extension:string|null,
 *   size:number, mismatch:boolean, variant:string|null, limit?:number, message:Message|null}} SniffResult
 */

/**
 * Decides what a file really is from its first bytes, and whether its name agrees.
 * Codes: empty, too_large, unsupported_type, corrupt, type_mismatch.
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {string} name
 * @returns {SniffResult}
 */
export function sniffFile(bytes, name) {
  const data = asBytes(bytes);
  const extension = extensionOf(name);
  const size = data.length;
  /** @param {string|null} code @param {Partial<SniffResult>} [extra] @returns {SniffResult} */
  const result = (code, extra = {}) => {
    const type = extra.type ?? null;
    return { ok: code === null, code, type, mime: type ? UPLOAD_TYPES[type].mime : null, extension, size, mismatch: false, variant: null, ...extra, message: messageFor(code) };
  };
  if (size === 0) return result('empty');
  if (size > MAX_UPLOAD_BYTES) return result('too_large', { limit: MAX_UPLOAD_BYTES });
  const found = detect(data);
  if (!found.type) return result('unsupported_type', { variant: found.variant ?? null });
  const type = found.type;
  const mismatch = extension !== null && !UPLOAD_TYPES[type].extensions.includes(extension);
  if (mismatch) return result('type_mismatch', { type, mismatch: true, variant: found.variant ?? null });
  if (found.corrupt) return result('corrupt', { type });
  if (type === 'musicxml' && size > MAX_MUSICXML_BYTES) return result('too_large', { type, limit: MAX_MUSICXML_BYTES, variant: found.variant ?? null });
  return result(null, { type, variant: found.variant ?? null });
}

/**
 * @typedef {{ok:boolean, code:string|null, pageCount:number|null, uncertain:boolean, estimate:number|null,
 *   encrypted:boolean, objectStreams:boolean, message:Message|null}} PdfInfo
 */

/**
 * Page count and encryption of a PDF, read from its uncompressed object dictionaries.
 * Pages are counted as distinct `/Type /Page` objects (never `/Pages`), the latest revision of each
 * object number winning. The count is called certain only when nothing can hide pages: either there
 * are no object streams and the root `/Count` (if present) agrees, or both counts agree exactly.
 * Otherwise `pageCount` is null, `uncertain` is true and `estimate` gives the best available number;
 * the caller should then count pages after rendering.
 * Codes: corrupt, encrypted, too_many_pages (only when the count is certain).
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {PdfInfo}
 */
export function pdfInfo(bytes) {
  const data = asBytes(bytes);
  const text = latin1(data);
  /** @param {string|null} code @param {Partial<PdfInfo>} fields @returns {PdfInfo} */
  const done = (code, fields) => ({ ok: code === null, code, pageCount: null, uncertain: true, estimate: null, encrypted: false, objectStreams: false, ...fields, message: messageFor(code) });
  if (!/%PDF-\d/.test(text.slice(0, 1024))) return done('corrupt', {});

  /** @type {Map<number, string>} object number → dictionary text of its latest revision */
  const objects = new Map();
  let objectStreams = false;
  const objRe = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = objRe.exec(text))) {
    const bodyStart = objRe.lastIndex;
    const endObj = text.indexOf('endobj', bodyStart);
    const stream = text.indexOf('stream', bodyStart);
    const hasStream = stream !== -1 && (endObj === -1 || stream < endObj);
    const dictEnd = hasStream ? stream : endObj === -1 ? text.length : endObj;
    const dict = text.slice(bodyStart, dictEnd);
    objects.set(Number(m[1]), dict);
    if (/\/Type\s*\/ObjStm\b/.test(dict)) objectStreams = true;
    if (hasStream) {
      const endStream = text.indexOf('endstream', stream + 6);
      objRe.lastIndex = endStream === -1 ? text.length : endStream + 9;
    } else if (endObj !== -1) objRe.lastIndex = endObj + 6;
  }
  const encrypted = /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(text);

  let pageObjects = 0;
  /** @type {Map<number, {count:number|null, root:boolean}>} */
  const pagesNodes = new Map();
  let catalogPages = null; let linearized = null;
  for (const [id, dict] of objects) {
    if (/\/Type\s*\/Page(?![A-Za-z0-9#])/.test(dict)) pageObjects++;
    if (/\/Type\s*\/Pages(?![A-Za-z0-9#])/.test(dict)) {
      const count = /\/Count\s+(\d+)/.exec(dict);
      pagesNodes.set(id, { count: count ? Number(count[1]) : null, root: !/\/Parent\s+\d+\s+\d+\s+R/.test(dict) });
    }
    if (/\/Type\s*\/Catalog\b/.test(dict)) {
      const ref = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(dict);
      if (ref) catalogPages = Number(ref[1]);
    }
    if (/\/Linearized\b/.test(dict)) {
      const n = /\/N\s+(\d+)/.exec(dict);
      if (n) linearized = Number(n[1]);
    }
  }
  let rootCount = null;
  if (catalogPages !== null && pagesNodes.has(catalogPages)) rootCount = pagesNodes.get(catalogPages)?.count ?? null;
  else {
    const roots = [...pagesNodes.values()].filter(p => p.root && p.count !== null);
    if (roots.length === 1) rootCount = roots[0].count;
  }

  const certain = objectStreams
    ? rootCount !== null && rootCount > 0 && rootCount === pageObjects
    : pageObjects > 0 && (rootCount === null || rootCount === pageObjects);
  const estimate = rootCount ?? linearized ?? (pageObjects || null);
  const fields = { pageCount: certain ? pageObjects : null, uncertain: !certain, estimate, encrypted, objectStreams };
  if (encrypted) return done('encrypted', fields);
  if (certain && pageObjects > MAX_PDF_PAGES) return done('too_many_pages', fields);
  if (!certain && estimate === null && !objectStreams) return done('corrupt', fields);
  return done(null, fields);
}

/** @typedef {{ok:boolean, code:string|null, type:'png'|'jpeg'|null, width:number|null, height:number|null, message:Message|null}} ImageInfo */

/**
 * Width and height of a PNG (IHDR) or JPEG (SOF marker) without decoding any pixel.
 * Codes: unsupported_type, corrupt, too_small (short side < 600 px), too_big_dimensions (> 12000 px).
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {ImageInfo}
 */
export function imageInfo(bytes) {
  const data = asBytes(bytes);
  /** @param {string|null} code @param {Partial<ImageInfo>} fields @returns {ImageInfo} */
  const done = (code, fields) => ({ ok: code === null, code, type: null, width: null, height: null, ...fields, message: messageFor(code) });
  let width = 0; let height = 0;
  /** @type {'png'|'jpeg'} */
  let type;
  if (startsWith(data, PNG_SIG)) {
    type = 'png';
    if (data.length < 24 || !startsWith(data, [0x49, 0x48, 0x44, 0x52], 12)) return done('corrupt', { type });
    const u32 = i => ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
    width = u32(16); height = u32(20);
  } else if (startsWith(data, [0xff, 0xd8, 0xff])) {
    type = 'jpeg';
    const size = jpegSize(data);
    if (!size) return done('corrupt', { type });
    ({ width, height } = size);
  } else return done('unsupported_type', {});
  if (!(width > 0 && height > 0)) return done('corrupt', { type, width, height });
  const fields = { type, width, height };
  if (Math.max(width, height) > MAX_IMAGE_SIDE) return done('too_big_dimensions', fields);
  if (Math.min(width, height) < MIN_SHORT_SIDE) return done('too_small', fields);
  return done(null, fields);
}

/** Walks JPEG markers to the first frame header (SOF0–SOF15 except DHT, JPG and DAC). */
function jpegSize(data) {
  let i = 2;
  const n = data.length;
  while (i + 1 < n) {
    if (data[i] !== 0xff) return null;
    let marker = data[i + 1];
    while (marker === 0xff && i + 2 < n) { i++; marker = data[i + 1]; }
    i += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or scan data before any frame header
    if (i + 1 >= n) return null;
    const len = (data[i] << 8) | data[i + 1];
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 6 >= n) return null;
      return { height: (data[i + 3] << 8) | data[i + 4], width: (data[i + 5] << 8) | data[i + 6] };
    }
    i += len;
  }
  return null;
}

/**
 * Everything that can be decided from bytes alone, in one call. Images still need
 * `staffLineScore` on their decoded pixels (`needsPixelCheck`), which this module never decodes.
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {string} name
 */
export function checkUpload(bytes, name) {
  const sniff = sniffFile(bytes, name);
  if (!sniff.ok) return { ...sniff, pdf: null, image: null, needsPixelCheck: false, warnings: [] };
  /** @type {string[]} */
  const warnings = [];
  if (sniff.type === 'pdf') {
    const pdf = pdfInfo(bytes);
    if (pdf.ok && pdf.uncertain) warnings.push('page_count_uncertain');
    return { ...sniff, ok: pdf.ok, code: pdf.code, message: pdf.message, pdf, image: null, needsPixelCheck: false, warnings };
  }
  if (sniff.type === 'png' || sniff.type === 'jpeg') {
    const image = imageInfo(bytes);
    return { ...sniff, ok: image.ok, code: image.code, message: image.message, pdf: null, image, needsPixelCheck: image.ok, warnings };
  }
  if (sniff.variant === 'timewise') warnings.push('timewise_not_supported');
  return { ...sniff, pdf: null, image: null, needsPixelCheck: false, warnings };
}

// ---------------------------------------------------------------------------------------------
// Pixels: does this look like printed music?

/**
 * RGBA (e.g. canvas ImageData.data) to 8-bit gray, transparent pixels composited over white.
 * @param {Uint8Array|Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function toGray(rgba, width, height) {
  const n = width * height;
  if (!Number.isInteger(n) || n <= 0 || !rgba || rgba.length < n * 4) throw new RangeError('rgba_size');
  const out = new Uint8Array(n);
  for (let p = 0, q = 0; p < n; p++, q += 4) {
    const a = rgba[q + 3];
    const lum = 0.299 * rgba[q] + 0.587 * rgba[q + 1] + 0.114 * rgba[q + 2];
    out[p] = Math.round((lum * a + 255 * (255 - a)) / 255);
  }
  return out;
}

/** Otsu threshold of a 256-bin histogram, with the two class means. */
function otsu(hist, total) {
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0; let wB = 0; let best = -1; let threshold = 127; let meanDark = 0; let meanLight = 255;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += v * hist[v];
    const mB = sumB / wB; const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = v; meanDark = mB; meanLight = mF; }
  }
  return { threshold, meanDark, meanLight };
}

/**
 * Flat-field correction: each pixel divided by a local paper brightness (90th percentile per tile,
 * bilinearly interpolated), so shadows and uneven light in photos do not look like ink.
 */
function normalise(gray, width, height) {
  const tile = Math.max(16, Math.min(128, Math.round(Math.max(width, height) / 24)));
  const tx = Math.ceil(width / tile); const ty = Math.ceil(height / tile);
  const bg = new Float64Array(tx * ty);
  const hist = new Uint32Array(256);
  for (let j = 0; j < ty; j++) {
    for (let i = 0; i < tx; i++) {
      hist.fill(0);
      const x1 = Math.min(width, (i + 1) * tile); const y1 = Math.min(height, (j + 1) * tile);
      let count = 0;
      for (let y = j * tile; y < y1; y++) for (let x = i * tile, p = y * width + x; x < x1; x++, p++) { hist[gray[p]]++; count++; }
      const target = count * 0.9;
      let acc = 0; let v = 0;
      for (; v < 255; v++) { acc += hist[v]; if (acc >= target) break; }
      bg[j * tx + i] = Math.max(v, 32);
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(ty - 1, Math.max(0, (y + 0.5) / tile - 0.5));
    const j0 = Math.floor(gy); const j1 = Math.min(ty - 1, j0 + 1); const fy = gy - j0;
    for (let x = 0; x < width; x++) {
      const gx = Math.min(tx - 1, Math.max(0, (x + 0.5) / tile - 0.5));
      const i0 = Math.floor(gx); const i1 = Math.min(tx - 1, i0 + 1); const fx = gx - i0;
      const b = (bg[j0 * tx + i0] * (1 - fx) + bg[j0 * tx + i1] * fx) * (1 - fy) + (bg[j1 * tx + i0] * (1 - fx) + bg[j1 * tx + i1] * fx) * fy;
      const p = y * width + x;
      out[p] = Math.min(255, Math.round((gray[p] * 255) / b));
    }
  }
  return out;
}

/**
 * @typedef {{top:number, bottom:number, spacing:number, lines:number[], left:number, right:number,
 *   bands:number, skewDeg:number|null, confidence:'high'|'medium'|'low', ruled:boolean}} Staff
 * @typedef {{staves:Staff[], coverage:number, verdict:'score'|'unclear'|'not_score', reasons:string[],
 *   lineThickness:number|null, skewDeg:number|null, bandWidth:number}} StaffLineResult
 */

const DEG = Math.PI / 180;

/**
 * A deterministic "does this look like printed music" signal from gray pixels (0 = black, 255 = white).
 *
 * 1. Flat-field correction against local paper brightness, then Otsu binarisation.
 * 2. Typical staff-line thickness from the most common vertical dark run; only thin vertical runs are
 *    kept, so noteheads, stems, text strokes and blobs drop out while horizontal lines remain.
 * 3. The width is cut into narrow column bands. Within a band a line skewed by up to ±2.5° stays a thin
 *    horizontal run (it may be split over a few rows), found by the band's row projection.
 * 4. Per band, five candidate lines whose four gaps agree within a tight tolerance form a staff. A run
 *    that continues at the same spacing above or below (ruled paper, tables) is marked as ruled.
 * 5. Band staves are chained across the width (spacing and skew-predicted position must agree), and a
 *    staff found in enough bands is "high"; in two bands "medium"; in one band or ruled "low".
 *
 * Verdict: "score" when at least one high staff exists, "not_score" only when no candidate staff at all
 * was found, otherwise "unclear" (send to review). Pencil marks, handwriting and scribbles do not form
 * five evenly spaced long thin lines, so they neither create nor (usually) destroy a staff.
 * @param {Uint8Array|Uint8ClampedArray} gray
 * @param {number} width
 * @param {number} height
 * @returns {StaffLineResult}
 */
export function staffLineScore(gray, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16) throw new RangeError('image_size');
  if (!gray || gray.length !== width * height) throw new RangeError('gray_size');
  const bandWidth = Math.max(24, Math.min(64, Math.round(width / 20)));
  /** @param {string[]} reasons @returns {StaffLineResult} */
  const nothing = (reasons, lineThickness = null) => ({ staves: [], coverage: 0, verdict: 'not_score', reasons, lineThickness, skewDeg: null, bandWidth });

  // 1. Binarise.
  const norm = normalise(gray, width, height);
  const hist = new Uint32Array(256);
  for (let p = 0; p < norm.length; p++) hist[norm[p]]++;
  const { threshold, meanDark, meanLight } = otsu(hist, norm.length);
  const cut = Math.min(threshold, 215);
  let inkCount = 0;
  for (let v = 0; v <= cut; v++) inkCount += hist[v];
  if (meanLight - meanDark < 40 || inkCount < norm.length * 0.002) return nothing(['no_ink']);
  const dark = new Uint8Array(norm.length);
  for (let p = 0; p < norm.length; p++) dark[p] = norm[p] <= cut ? 1 : 0;

  // 2. Line thickness from vertical dark runs (sampled columns), then the thin-run mask.
  const runHist = new Uint32Array(65);
  const stride = Math.max(1, Math.floor(width / 300));
  for (let x = 0; x < width; x += stride) {
    let run = 0;
    for (let y = 0, p = x; y <= height; y++, p += width) {
      if (y < height && dark[p]) run++;
      else if (run) { if (run <= 64) runHist[run]++; run = 0; }
    }
  }
  let thickness = 1;
  for (let r = 2; r <= Math.min(32, Math.floor(height / 20)); r++) if (runHist[r] > runHist[thickness]) thickness = r;
  if (!runHist[thickness]) return nothing(['no_ink']);
  const maxThin = Math.max(2, Math.ceil(thickness * 2) + 1);

  // 3. Per-band row projections of the thin mask.
  const bands = Math.max(1, Math.floor(width / bandWidth));
  const bandX = k => [k * bandWidth, k === bands - 1 ? width : (k + 1) * bandWidth];
  const thin = new Uint8Array(norm.length);
  const rows = new Int32Array(bands * height);
  for (let x = 0; x < width; x++) {
    const k = Math.min(bands - 1, Math.floor(x / bandWidth));
    let run = 0;
    for (let y = 0; y <= height; y++) {
      if (y < height && dark[y * width + x]) { run++; continue; }
      if (run && run <= maxThin) for (let r = y - run; r < y; r++) { thin[r * width + x] = 1; rows[k * height + r]++; }
      run = 0;
    }
  }

  // Candidate lines per band.
  /** @type {{y:number, len:number, coverage:number}[][]} */
  const candidates = [];
  for (let k = 0; k < bands; k++) {
    const [x0, x1] = bandX(k); const bw = x1 - x0;
    const drift = Math.ceil(bw * Math.tan(2.5 * DEG));
    const maxRun = maxThin + drift + 1;
    const list = [];
    for (let y = 0; y < height; y++) {
      if (rows[k * height + y] / bw < 0.1) continue;
      let b = y; let mass = 0; let moment = 0;
      while (b < height && rows[k * height + b] / bw >= 0.1) { const f = rows[k * height + b] / bw; mass += f; moment += f * b; b++; }
      const a = y; y = b;
      const len = b - a;
      if (len > maxRun) continue;
      let covered = 0;
      for (let x = x0; x < x1; x++) {
        for (let r = a; r < b; r++) if (thin[r * width + x]) { covered++; break; }
      }
      const coverage = covered / bw;
      if (coverage >= 0.6) list.push({ y: moment / mass, len, coverage });
    }
    candidates.push(list);
  }

  // 4. Five evenly spaced lines per band.
  const minS = Math.max(4, 2 * thickness + 1);
  const maxS = Math.min(200, height / 4.5);
  const tolOf = s => Math.max(1.25, 0.1 * s);
  /** @type {{band:number, x:number, ys:number[], s:number, ruled:boolean}[]} */
  const bandStaves = [];
  candidates.forEach((list, k) => {
    const groups = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const s0 = list[j].y - list[i].y;
        if (s0 < minS) continue;
        if (s0 > maxS) break;
        const picked = [i, j];
        for (let n = 2; n <= 4 && picked.length === n; n++) {
          const est = (list[picked[n - 1]].y - list[i].y) / (n - 1);
          const target = list[i].y + n * est;
          let bestIdx = -1; let bestDist = Infinity;
          for (let q = picked[n - 1] + 1; q < list.length && list[q].y <= target + tolOf(est); q++) {
            const d = Math.abs(list[q].y - target);
            if (d < bestDist) { bestDist = d; bestIdx = q; }
          }
          if (bestIdx !== -1 && bestDist <= tolOf(est)) picked.push(bestIdx);
        }
        if (picked.length !== 5) continue;
        const ys = picked.map(q => list[q].y);
        const s = (ys[4] - ys[0]) / 4;
        const dev = Math.max(...ys.slice(1).map((y, q) => Math.abs(y - ys[q] - s)));
        if (dev > tolOf(s)) continue;
        if (picked.some(q => list[q].len > 0.6 * s + 1)) continue;
        const near = y => list.some(c => Math.abs(c.y - y) <= tolOf(s));
        groups.push({ ys, s, dev: dev / s, ruled: near(ys[0] - s) || near(ys[4] + s) });
      }
    }
    groups.sort((a, b) => a.dev - b.dev || a.ys[0] - b.ys[0]);
    const chosen = [];
    for (const g of groups) {
      if (chosen.some(c => g.ys[0] <= c.ys[4] + c.s * 0.5 && g.ys[4] >= c.ys[0] - c.s * 0.5)) continue;
      chosen.push(g);
    }
    const [x0, x1] = bandX(k);
    for (const g of chosen) bandStaves.push({ band: k, x: (x0 + x1) / 2, ys: g.ys, s: g.s, ruled: g.ruled });
  });

  // 5. Chain band staves across the width.
  /** @type {{members:typeof bandStaves}[]} */
  const clusters = [];
  const slopeOf = members => {
    if (members.length < 2) return 0;
    const mx = members.reduce((a, m) => a + m.x, 0) / members.length;
    const my = members.reduce((a, m) => a + m.ys[0], 0) / members.length;
    let num = 0; let den = 0;
    for (const m of members) { num += (m.x - mx) * (m.ys[0] - my); den += (m.x - mx) ** 2; }
    return den ? num / den : 0;
  };
  bandStaves.sort((a, b) => a.band - b.band || a.ys[0] - b.ys[0]);
  for (const bs of bandStaves) {
    let best = null; let bestDist = Infinity;
    for (const c of clusters) {
      const last = c.members[c.members.length - 1];
      if (last.band >= bs.band) continue;
      const s = c.members.reduce((a, m) => a + m.s, 0) / c.members.length;
      if (Math.abs(bs.s - s) > Math.max(1.5, 0.2 * s)) continue;
      const dx = bs.x - last.x;
      const predicted = last.ys[0] + slopeOf(c.members) * dx;
      const dist = Math.abs(bs.ys[0] - predicted);
      const allowed = Math.max(0.5 * s, Math.abs(dx) * Math.tan(3 * DEG) + 1.5);
      if (dist <= allowed && dist < bestDist) { best = c; bestDist = dist; }
    }
    if (best) best.members.push(bs); else clusters.push({ members: [bs] });
  }

  const strongBands = Math.max(3, Math.round(0.2 * bands));
  /** @type {Staff[]} */
  const staves = clusters.map(({ members }) => {
    const n = members.length;
    const lines = [0, 1, 2, 3, 4].map(i => round1(members.reduce((a, m) => a + m.ys[i], 0) / n));
    const spacing = round1(members.reduce((a, m) => a + m.s, 0) / n);
    const ruled = members.filter(m => m.ruled).length * 2 > n;
    /** @type {Staff['confidence']} */
    const confidence = ruled || n < 2 ? 'low' : n >= strongBands ? 'high' : 'medium';
    const skew = n >= 3 ? round1(Math.atan(slopeOf(members)) / DEG) : null;
    return { top: lines[0], bottom: lines[4], spacing, lines, left: bandX(members[0].band)[0], right: bandX(members[n - 1].band)[1], bands: n, skewDeg: skew, confidence, ruled };
  }).sort((a, b) => a.top - b.top);

  const covered = new Uint8Array(height);
  for (const st of staves) {
    for (let y = Math.max(0, Math.floor(st.top - 2 * st.spacing)); y <= Math.min(height - 1, Math.ceil(st.bottom + 2 * st.spacing)); y++) covered[y] = 1;
  }
  const coverage = Math.round((covered.reduce((a, v) => a + v, 0) / height) * 1000) / 1000;
  const skews = staves.map(s => s.skewDeg).filter(v => v !== null).sort((a, b) => a - b);
  const skewDeg = skews.length ? skews[Math.floor(skews.length / 2)] : null;
  /** @type {string[]} */
  const reasons = [];
  if (!staves.length) reasons.push('no_staff_lines');
  if (staves.some(s => s.ruled)) reasons.push('ruled_lines');
  if (staves.length && !staves.some(s => s.confidence === 'high')) reasons.push('weak_staves');
  const verdict = staves.some(s => s.confidence === 'high') ? 'score' : staves.length ? 'unclear' : 'not_score';
  return { staves, coverage, verdict, reasons, lineThickness: thickness, skewDeg, bandWidth };
}

const round1 = v => Math.round(v * 10) / 10;
