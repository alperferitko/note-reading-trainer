// Compressed MusicXML (.mxl) is a ZIP archive: META-INF/container.xml names the score file inside.
// Read with the browser's own DecompressionStream; only "stored" and "deflate" entries exist in .mxl.

const MAX_SCORE_BYTES = 2 * 1024 * 1024;

type Entry = { name: string; method: number; size: number; compressed: number; offset: number };

function entries(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('corrupt');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: Entry[] = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error('corrupt');
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    out.push({ method: view.getUint16(at + 10, true), compressed: view.getUint32(at + 20, true), size: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true), name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)) });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

async function inflate(bytes: Uint8Array, entry: Entry): Promise<string> {
  if (entry.size > MAX_SCORE_BYTES) throw new Error('too_large');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error('corrupt');
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.slice(start, start + entry.compressed);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('unsupported_compression');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const text = await new Response(stream).text();
  if (text.length > MAX_SCORE_BYTES) throw new Error('too_large');
  return text;
}

/** The MusicXML text inside an .mxl file. Throws `corrupt`, `too_large`, `no_score` or `unsupported_compression`. */
export async function readMxl(bytes: Uint8Array): Promise<string> {
  const list = entries(bytes);
  const container = list.find((entry) => entry.name === 'META-INF/container.xml');
  let path: string | null = null;
  if (container) path = /full-path="([^"]+)"/.exec(await inflate(bytes, container))?.[1] ?? null;
  const score = list.find((entry) => entry.name === path)
    ?? list.find((entry) => !entry.name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(entry.name));
  if (!score) throw new Error('no_score');
  return inflate(bytes, score);
}
