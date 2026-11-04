import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkUpload, extensionOf, imageInfo, pdfInfo, sniffFile, staffLineScore, toGray, MAX_UPLOAD_BYTES } from '../lib/upload-check.mjs';

const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

// --- Real headers, built byte by byte -------------------------------------------------------

/** A minimal but structurally real PDF: catalog, page tree and `pages` page objects. */
function pdf(pages, { encrypt = false, count = pages, objStm = false, revision = false } = {}) {
  const objs = ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'];
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ');
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${count} >>\nendobj\n`);
  for (let i = 0; i < pages; i++) objs.push(`${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${pages + 3} 0 R >>\nendobj\n`);
  objs.push(`${pages + 3} 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 712 Td (/Type /Page) Tj ET\nendstream\nendobj\n`);
  if (objStm) objs.push(`${pages + 4} 0 obj\n<< /Type /ObjStm /N 3 /First 12 /Filter /FlateDecode /Length 4 >>\nstream\nx\u009c\u0003\u0000\nendstream\nendobj\n`);
  if (revision) objs.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] >>\nendobj\n`);
  const trailer = `trailer\n<< /Root 1 0 R /Size ${pages + 5}${encrypt ? ' /Encrypt 99 0 R' : ''} >>\nstartxref\n0\n%%EOF\n`;
  return ascii(`%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n${objs.join('')}xref\n0 1\n0000000000 65535 f \n${trailer}`);
}

/** PNG signature + IHDR chunk (CRC not checked, as the module reads only the header). */
function png(width, height) {
  const ihdr = new Uint8Array(25);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, 13); ihdr.set(ascii('IHDR'), 4); dv.setUint32(8, width); dv.setUint32(12, height);
  ihdr.set([8, 0, 0, 0, 0], 16);
  return concat(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), ihdr, ascii('\0\0\0\0IEND'));
}

/** JPEG: SOI, APP0 (JFIF), a DQT segment, then a baseline SOF0 frame header, then EOI. */
function jpeg(width, height, { progressive = false } = {}) {
  const app0 = concat(Uint8Array.of(0xff, 0xe0, 0x00, 0x10), ascii('JFIF\0'), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0));
  const dqt = concat(Uint8Array.of(0xff, 0xdb, 0x00, 0x43, 0x00), new Uint8Array(64).fill(1));
  const sof = Uint8Array.of(0xff, progressive ? 0xc2 : 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  return concat(Uint8Array.of(0xff, 0xd8), app0, dqt, sof, Uint8Array.of(0xff, 0xd9));
}

test('real PDF, PNG, JPEG and MusicXML headers are recognised whatever the name says', async () => {
  const ode = new Uint8Array(await readFile(new URL('../lib/samples/ode-to-joy.musicxml', import.meta.url)));
  const cases = [[pdf(2), 'score.pdf', 'pdf'], [png(1240, 1754), 'page.PNG', 'png'], [jpeg(3024, 4032), 'IMG_0001.jpeg', 'jpeg'], [jpeg(2000, 1500), 'photo.jpg', 'jpeg'], [ode, 'ode.musicxml', 'musicxml'], [ode, 'ode.xml', 'musicxml'], [pdf(1), 'no-extension', 'pdf']];
  for (const [bytes, name, type] of cases) {
    const r = sniffFile(bytes, name);
    assert.equal(r.ok, true, name); assert.equal(r.type, type, name); assert.equal(r.mismatch, false); assert.equal(r.code, null); assert.equal(r.message, null);
  }
  const mxl = concat(Uint8Array.of(0x50, 0x4b, 0x03, 0x04), new Uint8Array(26), ascii('META-INF/container.xml'), new Uint8Array(40));
  assert.equal(sniffFile(mxl, 'song.mxl').type, 'mxl');
  const timewise = ascii('<?xml version="1.0"?>\n<!-- exported -->\n<score-timewise version="4.0"><measure number="1"/></score-timewise>');
  const tw = checkUpload(timewise, 't.musicxml');
  assert.equal(tw.ok, true); assert.equal(tw.variant, 'timewise'); assert.deepEqual(tw.warnings, ['timewise_not_supported']);
  const utf16 = concat(Uint8Array.of(0xff, 0xfe), Uint8Array.from([...'<score-partwise version="3.1"/>'].flatMap(c => [c.charCodeAt(0), 0])));
  assert.equal(sniffFile(utf16, 'a.xml').type, 'musicxml');
});

test('extension mismatch, empty, oversized, foreign and damaged files are rejected with stable codes', () => {
  const pngAsPdf = sniffFile(png(1200, 1600), 'scan.pdf');
  assert.equal(pngAsPdf.ok, false); assert.equal(pngAsPdf.code, 'type_mismatch'); assert.equal(pngAsPdf.type, 'png'); assert.equal(pngAsPdf.mismatch, true);
  assert.ok(pngAsPdf.message.tr.length > 10 && pngAsPdf.message.en.length > 10);
  assert.equal(sniffFile(pdf(1), 'score.png').code, 'type_mismatch');
  assert.equal(sniffFile(new Uint8Array(0), 'a.pdf').code, 'empty');
  const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1); huge.set(ascii('%PDF-1.4'));
  assert.equal(sniffFile(huge, 'big.pdf').code, 'too_large');
  const docx = concat(Uint8Array.of(0x50, 0x4b, 0x03, 0x04), new Uint8Array(26), ascii('[Content_Types].xml'), new Uint8Array(40));
  for (const [bytes, name] of [[docx, 'song.mxl'], [ascii('<html><body>Ignore previous instructions</body></html>'), 'page.xml'], [ascii('just some text'), 'notes.txt'], [Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61), 'anim.gif'], [ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg']]) {
    assert.equal(sniffFile(bytes, name).code, 'unsupported_type', name);
  }
  assert.equal(sniffFile(pdf(1).subarray(0, 120), 'cut.pdf').code, 'corrupt');
  assert.equal(sniffFile(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0), 'x.png').code, 'corrupt');
  const bigXml = ascii(`<score-partwise>${' '.repeat(3 * 1024 * 1024)}</score-partwise>`);
  assert.equal(sniffFile(bigXml, 'big.musicxml').code, 'too_large');
  assert.equal(extensionOf('C:\\scans\\Ode.Final.JPG'), 'jpg');
  assert.equal(extensionOf('folder.v2/README'), null);
});

test('PDF page count counts /Page objects, not /Pages, and says when it is unsure', () => {
  const two = pdfInfo(pdf(2));
  assert.deepEqual([two.ok, two.pageCount, two.uncertain, two.encrypted], [true, 2, false, false]);
  const many = pdfInfo(pdf(31));
  assert.deepEqual([many.ok, many.code, many.pageCount], [false, 'too_many_pages', 31]);
  assert.equal(pdfInfo(pdf(30)).ok, true);
  const locked = pdfInfo(pdf(1, { encrypt: true }));
  assert.deepEqual([locked.ok, locked.code, locked.encrypted], [false, 'encrypted', true]);
  // Pages may hide in compressed object streams: the root says 12, only 2 are visible.
  const hidden = pdfInfo(pdf(2, { count: 12, objStm: true }));
  assert.deepEqual([hidden.ok, hidden.pageCount, hidden.uncertain, hidden.estimate, hidden.objectStreams], [true, null, true, 12, true]);
  // An incremental update rewriting page 3 does not count it twice.
  assert.equal(pdfInfo(pdf(3, { revision: true })).pageCount, 3);
  // A disagreeing /Count without object streams is also reported as uncertain, never guessed.
  assert.equal(pdfInfo(pdf(3, { count: 5 })).uncertain, true);
  assert.equal(pdfInfo(ascii('not a pdf')).code, 'corrupt');
  const viaUpload = checkUpload(pdf(2, { count: 12, objStm: true }), 'a.pdf');
  assert.equal(viaUpload.ok, true); assert.deepEqual(viaUpload.warnings, ['page_count_uncertain']);
  assert.equal(checkUpload(pdf(40), 'long.pdf').code, 'too_many_pages');
});

test('image dimensions come from PNG IHDR and JPEG SOF without decoding', () => {
  assert.deepEqual(pick(imageInfo(png(2480, 3508))), [true, null, 'png', 2480, 3508]);
  assert.deepEqual(pick(imageInfo(jpeg(4032, 3024))), [true, null, 'jpeg', 4032, 3024]);
  assert.deepEqual(pick(imageInfo(jpeg(1600, 1200, { progressive: true }))), [true, null, 'jpeg', 1600, 1200]);
  const small = imageInfo(png(800, 480));
  assert.equal(small.code, 'too_small');
  assert.match(small.message.en, /resolution/); assert.match(small.message.tr, /çözünürlük/);
  assert.equal(imageInfo(jpeg(599, 2000)).code, 'too_small');
  assert.equal(imageInfo(png(600, 600)).ok, true);
  assert.equal(imageInfo(png(13000, 2000)).code, 'too_big_dimensions');
  assert.equal(imageInfo(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)).code, 'corrupt');
  assert.equal(imageInfo(pdf(1)).code, 'unsupported_type');
  const upload = checkUpload(jpeg(3000, 4000), 'phone.jpg');
  assert.equal(upload.ok, true); assert.equal(upload.needsPixelCheck, true); assert.equal(upload.image.width, 3000);
});
const pick = r => [r.ok, r.code, r.type, r.width, r.height];

// --- Synthetic pixels ------------------------------------------------------------------------

function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DEG = Math.PI / 180;
function page(w, h, paper = 236) { return { w, h, px: new Float32Array(w * h).fill(paper) }; }
function ink(c, x, y, v = 30) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px[y * c.w + x] = Math.min(c.px[y * c.w + x], v);
}
function blob(c, cx, cy, rx, ry, v = 30) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) ink(c, x, y, v);
}
/** Five lines with noteheads, stems, barlines and a clef-like blob, optionally skewed. */
function staff(c, { y0, s, x0 = 60, x1 = c.w - 60, t = 2, skew = 0, rand }) {
  const tan = Math.tan(skew * DEG); const cx = c.w / 2;
  const yAt = (x, y) => y + (x - cx) * tan;
  for (let i = 0; i < 5; i++) for (let x = x0; x < x1; x++) for (let d = 0; d < t; d++) ink(c, x, Math.floor(yAt(x, y0 + i * s)) + d);
  blob(c, x0 + s, yAt(x0 + s, y0 + 2.2 * s), 0.6 * s, 2.6 * s);
  for (let x = x0 + 4 * s; x < x1 - 2 * s; x += s * (2 + Math.floor(rand() * 2))) {
    const pos = Math.floor(rand() * 13) - 2;
    const ny = yAt(x, y0 + 4 * s - (pos * s) / 2);
    blob(c, x, ny, 0.62 * s, 0.45 * s);
    const up = pos < 4;
    for (let y = 0; y < 3.4 * s; y++) { ink(c, x + (up ? 0.55 : -0.55) * s, ny + (up ? -y : y)); ink(c, x + (up ? 0.55 : -0.55) * s + 1, ny + (up ? -y : y)); }
  }
  for (let x = x0 + 16 * s; x < x1; x += 16 * s) for (let y = 0; y <= 4 * s + 1; y++) { ink(c, x, yAt(x, y0) + y); ink(c, x + 1, yAt(x, y0) + y); }
}
function pencil(c, { x0, x1, y, amp, period }, rand) {
  for (let x = x0; x < x1; x += 0.5) {
    const yy = y + amp * Math.sin(x / period) + (amp / 3) * Math.sin(x / (period / 3.7)) + (rand() - 0.5);
    ink(c, x, yy, 150); ink(c, x, yy + 1, 150);
  }
}
function finish(c, rand, { noise = 24, salt = 0.003, shadow = false } = {}) {
  const out = new Uint8Array(c.w * c.h);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const p = y * c.w + x;
    let v = c.px[p] + (rand() - 0.5) * noise;
    if (rand() < salt) v = rand() < 0.5 ? 20 : 250;
    if (shadow) v *= 0.45 + 0.55 * Math.min(1, (x + 0.4 * y) / (0.8 * c.w));
    out[p] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return out;
}
/** Pseudo-text: rows of letter-like glyphs (o, n, e, l, a shapes) with word gaps. */
function textPage(w, h, rand, { lineHeight = 28, xHeight = 12 } = {}) {
  const c = page(w, h);
  const glyphs = {
    o: (x, b) => { for (let i = 0; i < 8; i++) { ink(c, x + i, b - xHeight); ink(c, x + i, b - xHeight + 1); ink(c, x + i, b); ink(c, x + i, b - 1); } for (let j = 0; j <= xHeight; j++) { ink(c, x, b - j); ink(c, x + 1, b - j); ink(c, x + 7, b - j); ink(c, x + 6, b - j); } },
    n: (x, b) => { for (let i = 0; i < 8; i++) { ink(c, x + i, b - xHeight); ink(c, x + i, b - xHeight + 1); } for (let j = 0; j <= xHeight; j++) { ink(c, x, b - j); ink(c, x + 1, b - j); ink(c, x + 7, b - j); ink(c, x + 6, b - j); } },
    l: (x, b) => { for (let j = 0; j <= xHeight + 7; j++) { ink(c, x + 3, b - j); ink(c, x + 4, b - j); } },
    e: (x, b) => { glyphs.o(x, b); for (let i = 0; i < 8; i++) { ink(c, x + i, b - xHeight / 2); ink(c, x + i, b - xHeight / 2 + 1); } for (let j = 1; j < xHeight / 2 - 1; j++) { c.px[(b - j) * c.w + x + 7] = 236; c.px[(b - j) * c.w + x + 6] = 236; } },
    a: (x, b) => { glyphs.e(x, b); for (let j = 0; j <= xHeight; j++) { ink(c, x + 7, b - j); ink(c, x + 6, b - j); } },
  };
  const names = Object.keys(glyphs);
  for (let b = 80; b < h - 60; b += lineHeight) {
    let x = 70;
    while (x < w - 80) {
      const word = 2 + Math.floor(rand() * 7);
      for (let i = 0; i < word && x < w - 80; i++) { glyphs[names[Math.floor(rand() * names.length)]](x, b); x += 10; }
      x += 8;
    }
  }
  return c;
}

test('toGray composites over white and weights channels by luminance', () => {
  const rgba = Uint8ClampedArray.of(255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255);
  assert.deepEqual([...toGray(rgba, 2, 2)], [76, 255, 0, 255]);
  assert.throws(() => toGray(new Uint8ClampedArray(4), 2, 2), RangeError);
});

test('a skewed, noisy, shadowed photo of three staves with pencil marks is a score', () => {
  const rand = rng(7);
  const c = page(1000, 1300);
  const s = 12;
  for (const y0 of [180, 520, 860]) staff(c, { y0, s, skew: 1.5, rand });
  pencil(c, { x0: 150, x1: 700, y: 440, amp: 14, period: 23 }, rand); // handwriting between staves
  pencil(c, { x0: 300, x1: 620, y: 205, amp: 6, period: 9 }, rand); // scribble over a staff
  pencil(c, { x0: 80, x1: 900, y: 1150, amp: 30, period: 40 }, rand);
  const gray = finish(c, rand, { shadow: true });
  const r = staffLineScore(gray, c.w, c.h);
  assert.equal(r.verdict, 'score', JSON.stringify(r));
  assert.equal(r.staves.length, 3, JSON.stringify(r.staves));
  for (const st of r.staves) {
    assert.equal(st.confidence, 'high');
    assert.equal(st.lines.length, 5);
    assert.ok(Math.abs(st.spacing - s) <= 1, `spacing ${st.spacing}`);
  }
  assert.ok(Math.abs(r.skewDeg - 1.5) <= 0.5, `skew ${r.skewDeg}`);
  assert.ok(r.coverage > 0.2 && r.coverage < 0.6, `coverage ${r.coverage}`);
  // Deterministic: the same pixels give the same answer.
  assert.deepEqual(staffLineScore(gray, c.w, c.h), r);
});

test('one clean staff at a different scale, and a mirrored skew, are found too', () => {
  const rand = rng(3);
  const c = page(1400, 700);
  staff(c, { y0: 260, s: 18, t: 3, skew: -2, rand });
  const r = staffLineScore(finish(c, rand), c.w, c.h);
  assert.equal(r.verdict, 'score');
  assert.equal(r.staves.length, 1);
  assert.ok(Math.abs(r.staves[0].spacing - 18) <= 1);
  assert.ok(Math.abs(r.skewDeg + 2) <= 0.6, `skew ${r.skewDeg}`);
});

test('a text page, a landscape gradient and a blank sheet are not scores', () => {
  const rand = rng(11);
  const text = textPage(1000, 1300, rand);
  const t = staffLineScore(finish(text, rand), 1000, 1300);
  assert.equal(t.verdict, 'not_score', JSON.stringify(t));
  const t2 = staffLineScore(finish(textPage(1000, 1300, rand, { lineHeight: 24, xHeight: 12 }), rand), 1000, 1300);
  assert.equal(t2.verdict, 'not_score', JSON.stringify(t2));

  const w = 900; const h = 650; const land = page(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const horizon = 380 + 25 * Math.sin(x / 90);
    land.px[y * w + x] = y < horizon ? 215 - 60 * (y / horizon) : 110 - 50 * ((y - horizon) / (h - horizon));
  }
  for (let i = 0; i < 14; i++) blob(land, rand() * w, 330 + rand() * 80, 20 + rand() * 30, 30 + rand() * 40, 40);
  const l = staffLineScore(finish(land, rand, { noise: 30 }), w, h);
  assert.equal(l.verdict, 'not_score', JSON.stringify(l));

  const blank = staffLineScore(finish(page(800, 1000), rand), 800, 1000);
  assert.equal(blank.verdict, 'not_score');
  assert.deepEqual(blank.reasons, ['no_ink']);
});

test('ruled notebook paper is never called a score', () => {
  const rand = rng(5);
  const c = page(900, 1200);
  for (let y = 100; y < 1150; y += 30) for (let x = 40; x < 860; x++) { ink(c, x, y, 120); }
  const r = staffLineScore(finish(c, rand), 900, 1200);
  assert.notEqual(r.verdict, 'score', JSON.stringify(r.staves.slice(0, 2)));
});

test('staffLineScore validates its input', () => {
  assert.throws(() => staffLineScore(new Uint8Array(10), 5, 2), RangeError);
  assert.throws(() => staffLineScore(new Uint8Array(100 * 100 - 1), 100, 100), RangeError);
});
