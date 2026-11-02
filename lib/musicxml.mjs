// Safe, dependency-free reading of uncompressed MusicXML (score-partwise) for practice.
// The parser accepts plain elements, attributes, text, comments, CDATA and a DOCTYPE without an
// internal subset. Entity declarations and internal subsets are rejected, so no entity can expand.
// What the practice converter supports is deliberately narrow and reported, never guessed.

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ELEMENTS = 200000;
export const MAX_DEPTH = 64;
export const MAX_PRACTICE_NOTES = 400;

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export class MusicXmlError extends Error {
  /** @param {string} code */
  constructor(code) { super(code); this.code = code; }
}

/** @typedef {{name:string, attrs:Record<string,string>, children:XmlNode[], text:string}} XmlNode */

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) throw new MusicXmlError('invalid_entity');
      return String.fromCodePoint(code);
    }
    if (!(body in NAMED)) throw new MusicXmlError('unknown_entity');
    return NAMED[body];
  });
}

/**
 * Parses XML text into a small tree. Throws MusicXmlError on anything unsafe or malformed.
 * @param {string} source
 * @returns {XmlNode}
 */
export function parseXml(source) {
  if (typeof source !== 'string') throw new MusicXmlError('not_text');
  if (source.length > MAX_FILE_BYTES) throw new MusicXmlError('too_large');
  if (/<!ENTITY/i.test(source)) throw new MusicXmlError('entities_not_allowed');
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  /** @type {XmlNode} */
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  /** @type {XmlNode[]} */
  const stack = [root];
  let count = 0;
  const len = source.length;
  while (i < len) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      if (source.slice(i).trim()) throw new MusicXmlError('trailing_text');
      break;
    }
    if (lt > i) stack[stack.length - 1].text += decodeEntities(source.slice(i, lt));
    if (source.startsWith('<?', lt)) {
      const end = source.indexOf('?>', lt + 2);
      if (end === -1) throw new MusicXmlError('malformed');
      i = end + 2; continue;
    }
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      if (end === -1) throw new MusicXmlError('malformed');
      i = end + 3; continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      if (end === -1) throw new MusicXmlError('malformed');
      stack[stack.length - 1].text += source.slice(lt + 9, end);
      i = end + 3; continue;
    }
    if (source.startsWith('<!DOCTYPE', lt) || source.startsWith('<!doctype', lt)) {
      const end = source.indexOf('>', lt);
      if (end === -1) throw new MusicXmlError('malformed');
      if (source.slice(lt, end).includes('[')) throw new MusicXmlError('internal_subset_not_allowed');
      i = end + 1; continue;
    }
    if (source[lt + 1] === '!') throw new MusicXmlError('malformed');
    const end = findTagEnd(source, lt + 1);
    const raw = source.slice(lt + 1, end);
    i = end + 1;
    if (raw[0] === '/') {
      const name = raw.slice(1).trim();
      const open = stack.pop();
      if (!open || open.name !== name || stack.length === 0) throw new MusicXmlError('mismatched_tag');
      continue;
    }
    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = /^([A-Za-z_][\w.:-]*)/.exec(body);
    if (!nameMatch) throw new MusicXmlError('malformed');
    /** @type {XmlNode} */
    const node = { name: nameMatch[1], attrs: {}, children: [], text: '' };
    const attrText = body.slice(nameMatch[1].length);
    const attrRe = /\s+([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let consumed = 0; let m;
    while ((m = attrRe.exec(attrText))) {
      if (m.index !== consumed) throw new MusicXmlError('malformed');
      node.attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '');
      consumed = attrRe.lastIndex;
    }
    if (attrText.slice(consumed).trim()) throw new MusicXmlError('malformed');
    if (++count > MAX_ELEMENTS) throw new MusicXmlError('too_complex');
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
      if (stack.length > MAX_DEPTH) throw new MusicXmlError('too_deep');
    }
  }
  if (stack.length !== 1) throw new MusicXmlError('unclosed_tag');
  const elements = root.children;
  if (elements.length !== 1) throw new MusicXmlError('malformed');
  return elements[0];
}

function findTagEnd(source, from) {
  let quote = '';
  for (let j = from; j < source.length; j++) {
    const ch = source[j];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return j;
    else if (ch === '<') break;
  }
  throw new MusicXmlError('malformed');
}

/** @param {XmlNode|undefined} node @param {string} name */
const child = (node, name) => node?.children.find(c => c.name === name);
/** @param {XmlNode|undefined} node @param {string} name */
const kids = (node, name) => node ? node.children.filter(c => c.name === name) : [];
/** @param {XmlNode|undefined} node */
const text = node => (node ? (node.text + node.children.map(text).join('')).trim() : '');
/** @param {XmlNode|undefined} node @param {string} name */
const num = (node, name) => { const raw = text(child(node, name)); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) ? value : null; };

/**
 * Reads parts and practice events. Unsupported content is listed per measure.
 * @param {string} source
 */
export function readMusicXml(source) {
  const root = parseXml(source);
  if (root.name === 'score-timewise') throw new MusicXmlError('timewise_not_supported');
  if (root.name !== 'score-partwise') throw new MusicXmlError('not_musicxml');
  const work = text(child(child(root, 'work'), 'work-title')) || text(child(root, 'movement-title'));
  const creator = kids(child(root, 'identification'), 'creator').find(c => c.attrs.type === 'composer');
  const partList = child(root, 'part-list');
  const names = new Map(kids(partList, 'score-part').map(p => [p.attrs.id, text(child(p, 'part-name')) || p.attrs.id]));
  const parts = kids(root, 'part').map(part => readPart(part, names.get(part.attrs.id) ?? part.attrs.id ?? '?'));
  if (!parts.length) throw new MusicXmlError('no_parts');
  return { title: work || null, composer: creator ? text(creator) || null : null, parts };
}

function readPart(part, name) {
  let divisions = 1; let fifths = 0; let beats = 4; let beatType = 4;
  /** @type {Record<number, string|null>} */
  const clefs = { 1: 'treble' };
  let staves = 1;
  const measures = [];
  /** @type {Set<string>} */
  const tiedOpen = new Set();
  for (const measure of kids(part, 'measure')) {
    const number = measure.attrs.number ?? String(measures.length + 1);
    /** @type {{staff:number, kind:'note'|'rest', voice:string, midi?:number, step?:string, alter?:number, octave?:number, clef?:string|null, beats:number, chord:boolean, grace:boolean, tieStop:boolean}[]} */
    const raw = [];
    /** @type {Set<string>} */
    const issues = new Set();
    for (const item of measure.children) {
      if (item.name === 'attributes') {
        divisions = num(item, 'divisions') ?? divisions;
        const key = child(item, 'key');
        if (key) fifths = num(key, 'fifths') ?? fifths;
        const time = child(item, 'time');
        if (time) { beats = num(time, 'beats') ?? beats; beatType = num(time, 'beat-type') ?? beatType; }
        staves = num(item, 'staves') ?? staves;
        for (const clef of kids(item, 'clef')) {
          const staff = Number(clef.attrs.number ?? 1);
          const sign = text(child(clef, 'sign')); const line = num(clef, 'line');
          clefs[staff] = sign === 'G' && (line ?? 2) === 2 && !child(clef, 'clef-octave-change') ? 'treble'
            : sign === 'F' && (line ?? 4) === 4 && !child(clef, 'clef-octave-change') ? 'bass' : null;
        }
      } else if (item.name === 'note') {
        const staff = num(item, 'staff') ?? 1;
        const voice = text(child(item, 'voice')) || '1';
        const duration = num(item, 'duration') ?? 0;
        const grace = Boolean(child(item, 'grace'));
        const chord = Boolean(child(item, 'chord'));
        const ties = kids(item, 'tie').map(t => t.attrs.type);
        const pitch = child(item, 'pitch');
        const entry = { staff, voice, beats: divisions > 0 ? duration / divisions : 0, chord, grace, tieStop: ties.includes('stop'), kind: /** @type {'note'|'rest'} */ ('rest'), clef: clefs[staff] ?? null };
        if (pitch) {
          const step = text(child(pitch, 'step')); const alter = num(pitch, 'alter') ?? 0; const octave = num(pitch, 'octave');
          const degree = STEPS.indexOf(step);
          if (degree === -1 || octave === null || !Number.isInteger(alter)) { issues.add('invalid_pitch'); continue; }
          Object.assign(entry, { kind: 'note', step, alter, octave, midi: (octave + 1) * 12 + SEMITONES[degree] + alter });
          const tieKey = `${staff}:${voice}:${entry.midi}`;
          if (ties.includes('stop') && tiedOpen.has(tieKey)) tiedOpen.delete(tieKey);
          else entry.tieStop = false;
          if (ties.includes('start')) tiedOpen.add(tieKey);
        } else if (!child(item, 'rest') && !child(item, 'unpitched')) { issues.add('invalid_note'); continue; }
        else if (child(item, 'unpitched')) { issues.add('unpitched'); continue; }
        raw.push(entry);
      } else if (item.name === 'backup' || item.name === 'forward') {
        // Moving the time cursor means a second layer of notes in this measure.
        if (item.name === 'backup') issues.add('multiple_layers');
      }
    }
    measures.push({ number, raw, issues: [...issues], meta: { divisions, fifths, beats, beatType, staves } });
  }
  return { name, staves, measures };
}

/**
 * Turns one staff of one part into practice events. Measures with chords, several voices,
 * unsupported clefs or double accidentals are excluded and named, not approximated.
 * @param {ReturnType<typeof readMusicXml>['parts'][number]} part
 * @param {number} staff
 */
export function practiceEvents(part, staff = 1) {
  const measures = part.measures.map((measure, index) => {
    const rows = measure.raw.filter(row => row.staff === staff);
    const issues = new Set(measure.issues.filter(issue => issue !== 'multiple_layers'));
    const voices = new Set(rows.map(row => row.voice));
    if (voices.size > 1) issues.add('multiple_voices');
    if (rows.some(row => row.chord)) issues.add('chords');
    if (rows.some(row => row.kind === 'note' && !row.clef)) issues.add('unsupported_clef');
    if (rows.some(row => row.kind === 'note' && Math.abs(row.alter ?? 0) > 1)) issues.add('double_accidental');
    const graceCount = rows.filter(row => row.grace).length;
    if (graceCount) issues.add('grace_notes_skipped');
    const blocking = [...issues].filter(issue => issue !== 'grace_notes_skipped');
    const events = blocking.length ? [] : rows.filter(row => !row.grace && !(row.kind === 'note' && row.tieStop)).map(row => row.kind === 'rest'
      ? { kind: 'rest', beats: row.beats }
      : { kind: 'note', midi: row.midi, step: row.step, alter: row.alter, octave: row.octave, clef: row.clef, beats: row.beats, position: positionOf(row) });
    return { index, number: measure.number, supported: blocking.length === 0, issues: [...issues], events, meta: measure.meta };
  });
  return measures;
}

/** Staff position relative to the clef's bottom line, as used by the rest of NotaNota. */
function positionOf(row) {
  const index = row.octave * 7 + STEPS.indexOf(row.step);
  return index - (row.clef === 'bass' ? 18 : 30);
}

/** Notes to ask, in order, from measures [from, to] (0-based indices, inclusive). */
export function practiceQueue(measures, from = 0, to = measures.length - 1) {
  const queue = [];
  for (const measure of measures.slice(Math.max(0, from), Math.min(measures.length, to + 1))) {
    if (!measure.supported) continue;
    measure.events.forEach((event, eventIndex) => {
      if (event.kind === 'note' && queue.length < MAX_PRACTICE_NOTES) queue.push({ ...event, measureIndex: measure.index, measureNumber: measure.number, eventIndex });
    });
  }
  return queue;
}

/** Which notation features a measure range uses, so the screen can say what was and was not practised. */
export function supportSummary(measures) {
  const supported = measures.filter(m => m.supported).length;
  const issues = new Map();
  for (const m of measures) for (const issue of m.issues) issues.set(issue, (issues.get(issue) ?? 0) + 1);
  return { measures: measures.length, supported, skipped: measures.length - supported, issues: Object.fromEntries(issues) };
}

/** Validates a chosen file before reading it. */
export function checkFile(name, size) {
  if (!/\.(musicxml|xml)$/i.test(String(name))) throw new MusicXmlError('unsupported_extension');
  if (!(size > 0)) throw new MusicXmlError('empty_file');
  if (size > MAX_FILE_BYTES) throw new MusicXmlError('too_large');
}
