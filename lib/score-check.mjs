// Musical consistency checks for MusicXML that came from recognition (OMR / AI) or from a person.
// Each finding names its place (part, measure, staff, voice, note index) and says what it saw; nothing
// is scored with a percentage, and anything NotaNota cannot practise is listed for review, never dropped.
// Text inside the file (titles, words, lyrics) is never echoed into messages or read as instructions.
//
// noteIndex: 0-based position of a <note> among the notes of the same staff and voice in one measure,
// in document order, counting rests, chord members and grace notes. Corrections use the same address.

import { parseXml, readMusicXml, MusicXmlError } from './musicxml.mjs';

/** @typedef {import('./musicxml.mjs').XmlNode} XmlNode */
/** @typedef {{tr:string, en:string}} Message */
/**
 * @typedef {{code:string, severity:'error'|'warn'|'info', part:number, measure:string|null, measureIndex:number|null,
 *   staff:number|null, voice:string|null, noteIndex:number|null, message:Message, [key:string]:unknown}} Issue
 */

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const EPS = 1e-6;

/** Printed accidental → the alter it means. Microtonal and other signs are not judged. */
const ACCIDENTAL_ALTER = { sharp: 1, flat: -1, natural: 0, 'double-sharp': 2, 'sharp-sharp': 2, 'flat-flat': -2, 'double-flat': -2, 'natural-sharp': 1, 'natural-flat': -1, 'triple-sharp': 3, 'triple-flat': -3 };
const ALTER_ACCIDENTAL = { 1: 'sharp', [-1]: 'flat', 0: 'natural', 2: 'double-sharp', [-2]: 'flat-flat' };
/** Note type → length in quarter notes. */
const TYPE_QUARTERS = { maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 1 / 16, '128th': 1 / 32, '256th': 1 / 64, '512th': 1 / 128, '1024th': 1 / 256 };
/** MusicXML order of <note> children, used when an element has to be inserted. */
const NOTE_ORDER = ['grace', 'cue', 'chord', 'pitch', 'unpitched', 'rest', 'duration', 'tie', 'instrument', 'footnote', 'level', 'voice', 'type', 'dot', 'accidental', 'time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];
const HARMLESS_NOTE_CHILDREN = new Set([...NOTE_ORDER.filter(n => n !== 'lyric'), 'cue']);

/** What NotaNota does not practise yet. warn = changes what is played; info = expression only. */
const FEATURES = {
  tuplet: ['warn', 'düzensiz grup (üçleme vb.)', 'tuplet'],
  grace_note: ['warn', 'süs notası', 'grace note'],
  cue_note: ['info', 'işaret notası', 'cue note'],
  unpitched: ['warn', 'perküsyon notası', 'unpitched note'],
  tremolo: ['warn', 'tremolo', 'tremolo'],
  repeat: ['warn', 'tekrar işareti', 'repeat sign'],
  volta: ['warn', 'volta (1./2. son)', 'volta (ending)'],
  segno_coda: ['warn', 'segno / coda', 'segno / coda'],
  jump: ['warn', 'D.C. / D.S. / Fine yönlendirmesi', 'D.C. / D.S. / Fine jump'],
  free_time: ['warn', 'ölçüsüz bölüm', 'unmetered passage'],
  nontraditional_key: ['warn', 'alışılmadık donanım', 'non-traditional key signature'],
  unsupported_clef: ['warn', 'desteklenmeyen anahtar', 'unsupported clef'],
  ornament: ['info', 'süsleme (tril, mordan…)', 'ornament (trill, mordent…)'],
  fermata: ['info', 'durak (fermata)', 'fermata'],
  arpeggio: ['info', 'arpej', 'arpeggio'],
  glissando: ['info', 'glissando', 'glissando'],
  articulation: ['info', 'artikülasyon', 'articulation'],
  technical: ['info', 'teknik işaret', 'technical mark'],
  dynamics: ['info', 'nüans', 'dynamics'],
  hairpin: ['info', 'crescendo / decrescendo', 'hairpin'],
  pedal: ['info', 'pedal işareti', 'pedal mark'],
  lyrics: ['info', 'şarkı sözü', 'lyrics'],
  text_direction: ['info', 'yazılı yönerge', 'text direction'],
  octave_shift: ['info', 'oktav kaydırma (8va)', 'octave shift (8va)'],
  chord_symbols: ['info', 'akor sembolü', 'chord symbol'],
  figured_bass: ['info', 'şifreli bas', 'figured bass'],
  transposing: ['info', 'transpoze çalgı', 'transposing instrument'],
  multi_rest: ['info', 'çok ölçülük sus', 'multi-measure rest'],
  other: ['info', 'tanınmayan öğe', 'unrecognised element'],
};

/** @param {XmlNode|undefined} node @param {string} name */
const child = (node, name) => node?.children.find(c => c.name === name);
/** @param {XmlNode|undefined} node @param {string} name */
const kids = (node, name) => (node ? node.children.filter(c => c.name === name) : []);
/** @param {XmlNode|undefined} node @returns {string} */
const text = node => (node ? (node.text + node.children.map(text).join('')).trim() : '');
/** @param {XmlNode|undefined} node @param {string} name */
const num = (node, name) => { const raw = text(child(node, name)); if (!raw) return null; const v = Number(raw); return Number.isFinite(v) ? v : null; };

/** Alter of `step` under a traditional key signature with `fifths` sharps (negative: flats). */
export function keyAlter(fifths, step) {
  const i = SHARPS.indexOf(step);
  if (fifths > 0) return i < fifths ? 1 : 0;
  if (fifths < 0) return 6 - i < -fifths ? -1 : 0;
  return 0;
}

const SIGN = { 1: '♯', [-1]: '♭', 2: '𝄪', [-2]: '𝄫', 0: '♮' };
/** @returns {Message} e.g. {tr:'Fa♯4', en:'F♯4'}; natural shown only when asked */
function noteName(step, alter, octave, showNatural = false) {
  const sign = alter === 0 ? (showNatural ? '♮' : '') : SIGN[alter] ?? `(${alter > 0 ? '+' : ''}${alter})`;
  return { tr: `${SOLFEGE[STEPS.indexOf(step)]}${sign}${octave}`, en: `${step}${sign}${octave}` };
}
/** @returns {Message} */
function keyName(fifths) {
  if (fifths === 0) return { tr: 'donanımsız (değiştiricisiz)', en: 'no sharps or flats' };
  const n = Math.abs(fifths); const s = fifths > 0 ? '♯' : '♭';
  return { tr: `${n}${s}`, en: `${n} ${fifths > 0 ? (n === 1 ? 'sharp' : 'sharps') : (n === 1 ? 'flat' : 'flats')} (${n}${s})` };
}
const fmt = v => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));

/** @type {Record<string, (d:any) => Message>} */
const MESSAGES = {
  measure_overfull: d => ({ tr: `${d.measure}. ölçü taşıyor: ${d.voice}. ses ${fmt(d.found)} vuruş, ölçü ${fmt(d.expected)} vuruş alır.`, en: `Measure ${d.measure} is over-full: voice ${d.voice} lasts ${fmt(d.found)} beats, the time signature allows ${fmt(d.expected)}.` }),
  measure_underfull: d => ({ tr: `${d.measure}. ölçü eksik: ${d.voice}. ses ${fmt(d.found)} vuruş, ölçü ${fmt(d.expected)} vuruş ister.`, en: `Measure ${d.measure} is under-full: voice ${d.voice} lasts ${fmt(d.found)} of ${fmt(d.expected)} beats.` }),
  voice_incomplete: d => ({ tr: `${d.measure}. ölçüde ${d.voice}. ses ölçü sonuna kadar sürmüyor (${fmt(d.found)}/${fmt(d.expected)} vuruş); gizli bir sus eksik olabilir.`, en: `In measure ${d.measure}, voice ${d.voice} stops early (${fmt(d.found)}/${fmt(d.expected)} beats); a hidden rest may be missing.` }),
  pickup_measure: d => ({ tr: `${d.measure}. ölçü anakruz (öncü ölçü): ${fmt(d.found)}/${fmt(d.expected)} vuruş, normal kabul edildi.`, en: `Measure ${d.measure} is a pickup: ${fmt(d.found)}/${fmt(d.expected)} beats, accepted.` }),
  final_complement: d => ({ tr: `Son ölçü (${d.measure}) anakruzu tamamlıyor: ${fmt(d.found)} + ${fmt(d.pickup)} = ${fmt(d.expected)} vuruş.`, en: `The last measure (${d.measure}) completes the pickup: ${fmt(d.found)} + ${fmt(d.pickup)} = ${fmt(d.expected)} beats.` }),
  empty_measure: d => ({ tr: `${d.measure}. ölçüde hiç nota ya da sus yok.`, en: `Measure ${d.measure} contains no notes or rests.` }),
  no_time_signature: () => ({ tr: 'Ölçü sayısı (zaman imzası) yok; ölçü süreleri denetlenmedi.', en: 'There is no time signature, so measure lengths were not checked.' }),
  invalid_divisions: d => ({ tr: `${d.measure}. ölçü: <divisions> değeri geçersiz.`, en: `Measure ${d.measure}: the <divisions> value is invalid.` }),
  missing_duration: d => ({ tr: `${d.measure}. ölçü: bir notanın süresi (<duration>) yok.`, en: `Measure ${d.measure}: a note has no <duration>.` }),
  invalid_pitch: d => ({ tr: `${d.measure}. ölçü: bir notanın perdesi okunamadı.`, en: `Measure ${d.measure}: a note's pitch could not be read.` }),
  invalid_note: d => ({ tr: `${d.measure}. ölçü: perdesi ya da susu olmayan bir nota var.`, en: `Measure ${d.measure}: a note has neither a pitch nor a rest.` }),
  type_duration_mismatch: d => ({ tr: `${d.measure}. ölçü: nota şekli (${d.type}) ile süresi uyuşmuyor (${fmt(d.found)} yerine ${fmt(d.expected)} birim beklenirdi).`, en: `Measure ${d.measure}: the note shape (${d.type}) does not match its duration (${fmt(d.found)} instead of ${fmt(d.expected)} divisions).` }),
  voice_overlap: d => ({ tr: `${d.measure}. ölçü, ${d.voice}. ses: notalar üst üste biniyor; akor ya da ayrı ses olarak işaretlenmemiş (backup/forward tutarsız).`, en: `Measure ${d.measure}, voice ${d.voice}: notes overlap without being marked as a chord or a separate voice (inconsistent backup/forward).` }),
  backup_underflow: d => ({ tr: `${d.measure}. ölçü: <backup> ölçünün başından da geriye gidiyor.`, en: `Measure ${d.measure}: a <backup> moves before the start of the measure.` }),
  chord_without_note: d => ({ tr: `${d.measure}. ölçü: akor notasının bağlanacağı bir önceki nota yok.`, en: `Measure ${d.measure}: a chord note has no preceding note to join.` }),
  chord_duration_mismatch: d => ({ tr: `${d.measure}. ölçü: akordaki notaların süreleri farklı.`, en: `Measure ${d.measure}: notes of one chord have different durations.` }),
  accidental_contradiction: d => ({ tr: `${d.measure}. ölçü: nota ${d.written.tr} olarak kodlanmış ama basılı değiştirici ${d.shown.tr} gösteriyor.`, en: `Measure ${d.measure}: the note is encoded as ${d.written.en} but its printed accidental shows ${d.shown.en}.` }),
  alter_contradicts_key: d => ({
    tr: `${d.measure}. ölçü: nota ${d.written.tr} olarak kodlanmış ve önünde değiştirici yok; ${d.source === 'key' ? 'donanıma' : d.source === 'tie' ? 'bağlı olduğu notaya' : 'ölçüdeki önceki değiştiriciye'} göre ${d.expected.tr} okunur. Donanımın ya da bir değiştiricinin kaçırılması sık bir tanıma hatasıdır.`,
    en: `Measure ${d.measure}: the note is encoded as ${d.written.en} with no accidental printed; ${d.source === 'key' ? 'the key signature' : d.source === 'tie' ? 'the note it is tied from' : 'an earlier accidental in the measure'} makes it ${d.expected.en}. A missed key signature or accidental is a common recognition error.`,
  }),
  key_signature_suspect: d => ({ tr: `${d.measure}. ölçüden itibaren donanım ${d.key.tr}, ama notalar ${d.suggested.tr} donanımıyla uyumlu (${d.steps.tr}). Donanım ya da bu notaların değiştiricileri yanlış okunmuş olabilir.`, en: `From measure ${d.measure} the key signature is ${d.key.en}, but the notes fit ${d.suggested.en} (${d.steps.en}). Either the key signature or these notes' accidentals were probably misread.` }),
  accidentals_not_encoded: () => ({ tr: 'Bu partide basılı değiştiriciler (<accidental>) kodlanmamış; notaların donanımla tutarlılığı denetlenemedi.', en: 'This part does not encode printed accidentals (<accidental>), so notes could not be checked against the key signature.' }),
  tie_broken: d => ({ tr: `${d.measure}. ölçü: ${d.note.tr} üzerindeki bağ, aynı seste aynı perdede bir notaya ulaşmıyor.`, en: `Measure ${d.measure}: the tie on ${d.note.en} does not reach a note of the same pitch in the same voice.` }),
  tie_pitch_mismatch: d => ({ tr: `${d.measure}. ölçü: bağ ${d.note.tr} ile başlıyor ama ${d.other.tr} ile bitiyor; bağlı notalar aynı perdede olmalı.`, en: `Measure ${d.measure}: a tie starts on ${d.note.en} but ends on ${d.other.en}; tied notes must share a pitch.` }),
  tie_stop_without_start: d => ({ tr: `${d.measure}. ölçü: ${d.note.tr} bir bağın sonu olarak işaretli ama bağın başlangıcı yok.`, en: `Measure ${d.measure}: ${d.note.en} is marked as the end of a tie that never started.` }),
  range_suspicious: d => ({ tr: `${d.measure}. ölçü: ${d.note.tr} porteden çok uzakta (${d.ledgerLines} ek çizgi ${d.direction === 'above' ? 'yukarıda' : 'aşağıda'}); büyük olasılıkla yanlış okunmuş.`, en: `Measure ${d.measure}: ${d.note.en} is far from the staff (${d.ledgerLines} ledger lines ${d.direction}); probably misread.` }),
  needs_review: d => ({ tr: `${d.measure}. ölçüde ${FEATURES[d.feature][1]} var (${d.count}); NotaNota bunu henüz çalıştırmıyor, lütfen gözden geçirin.`, en: `Measure ${d.measure} contains ${FEATURES[d.feature][2]} (${d.count}); NotaNota does not practise this yet, please review.` }),
};

// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{part:number, measure:string, measureIndex:number, staff:number, voice:string, noteIndex:number,
 *   kind:'note'|'rest'|'unpitched'|'invalid', step:string|null, alter:number, octave:number|null, accidental:string|null,
 *   grace:boolean, chord:boolean, duration:number, start:number, absStart:number, type:string|null, dots:number,
 *   timeMod:{actual:number, normal:number}|null, tieStart:boolean, tieStop:boolean, fifths:number|null, divisions:number|null,
 *   order:number, contextAlter:number|null}} NoteInfo
 */

/** Reads clef sign/line/octave change. */
function readClef(clef) {
  const sign = text(child(clef, 'sign'));
  const line = num(clef, 'line') ?? (sign === 'G' ? 2 : sign === 'F' ? 4 : sign === 'C' ? 3 : 0);
  return { sign, line, octave: num(clef, 'clef-octave-change') ?? 0 };
}

/** Position on the staff: 0 = bottom line, 8 = top line. Null for percussion, TAB or no clef. */
function staffPosition(clef, step, octave, shift) {
  if (!clef || !['G', 'F', 'C'].includes(clef.sign)) return null;
  const ref = clef.sign === 'G' ? 32 : clef.sign === 'F' ? 24 : 28;
  const bottom = ref - 2 * (clef.line - 1) + 7 * clef.octave;
  return octave * 7 + STEPS.indexOf(step) - bottom + shift;
}

/** Walks one part, collecting notes in document order and raising issues. */
function analysePart(part, partIndex) {
  /** @type {Issue[]} */
  const issues = [];
  const measureNodes = kids(part, 'measure');
  const encodesAccidentals = measureNodes.some(m => kids(m, 'note').some(n => child(n, 'accidental')));
  const st = { divisions: /** @type {number|null} */ (null), fifths: 0, keyKnown: true, time: /** @type {{quarters:number, beatType:number}|null} */ (null), timeSeen: false, clefs: new Map([[1, { sign: 'G', line: 2, octave: 0 }]]), shifts: new Map() };
  /** @type {NoteInfo[]} */
  const notes = [];
  /** @type {Map<string, NoteInfo[][]>} */
  const sequences = new Map();
  /** @type {Map<string, number>} */
  const tieOpen = new Map();
  /** @type {{fifths:number, measure:string, measureIndex:number, notes:NoteInfo[]}[]} */
  const keySegments = [];
  const measures = [];
  let partTime = 0; let order = 0;
  let chromaticWithoutSigns = false;

  /** @param {string} code @param {'error'|'warn'|'info'} severity @param {any} at @param {any} [data] */
  const raise = (code, severity, at, data = {}) => {
    const where = { part: partIndex, measure: at.measure ?? null, measureIndex: at.measureIndex ?? null, staff: at.staff ?? null, voice: at.voice ?? null, noteIndex: at.noteIndex ?? null };
    issues.push({ code, severity, ...where, message: MESSAGES[code]({ ...where, ...data }), ...publicData(data) });
  };

  measureNodes.forEach((measure, mi) => {
    const number = measure.attrs.number ?? String(mi + 1);
    const here = { measure: number, measureIndex: mi };
    /** @type {Map<string, {staff:number|null, voice:string|null, noteIndex:number|null, count:number, name:string}>} */
    const features = new Map();
    const feature = (name, at = {}) => {
      const key = `${name}|${at.staff ?? ''}`;
      const f = features.get(key);
      if (f) f.count++; else features.set(key, { staff: at.staff ?? null, voice: at.voice ?? null, noteIndex: at.noteIndex ?? null, count: 1, name });
    };
    /** @type {Map<string, number>} */
    const counters = new Map();
    /** @type {Map<string, {staff:number, voice:string, end:number, any:boolean}>} */
    const voices = new Map();
    /** @type {Set<string>} */
    const overlapReported = new Set();
    /** @type {NoteInfo[]} */
    const measureNotes = [];
    let cursor = 0; let maxCursor = 0; let lastStart = 0;
    /** @type {NoteInfo|null} */
    let lastHead = null;
    /** @type {NoteInfo[]|null} */
    let lastGroup = null;

    for (const item of measure.children) {
      if (item.name === 'attributes') {
        if (child(item, 'divisions')) {
          const d = num(item, 'divisions');
          if (d === null || d <= 0) raise('invalid_divisions', 'error', here); else st.divisions = d;
        }
        const key = child(item, 'key');
        if (key) {
          const fifths = num(key, 'fifths');
          if (fifths === null || !Number.isInteger(fifths) || Math.abs(fifths) > 7) { st.keyKnown = false; feature('nontraditional_key'); }
          else { st.keyKnown = true; st.fifths = fifths; }
          keySegments.push({ fifths: st.keyKnown ? st.fifths : NaN, measure: number, measureIndex: mi, notes: [] });
        }
        const time = child(item, 'time');
        if (time) {
          st.timeSeen = true;
          if (child(time, 'senza-misura')) { st.time = null; feature('free_time'); }
          else {
            const beats = kids(time, 'beats').map(b => text(b).split('+').reduce((a, v) => a + Number(v), 0));
            const types = kids(time, 'beat-type').map(b => Number(text(b)));
            let quarters = 0;
            beats.forEach((b, i) => { quarters += (b * 4) / (types[i] ?? types[types.length - 1]); });
            st.time = Number.isFinite(quarters) && quarters > 0 ? { quarters, beatType: types[types.length - 1] } : null;
          }
        }
        for (const clef of kids(item, 'clef')) {
          const c = readClef(clef);
          st.clefs.set(Number(clef.attrs.number ?? 1), c);
          const supported = (c.sign === 'G' && c.line === 2 && !c.octave) || (c.sign === 'F' && c.line === 4 && !c.octave);
          if (!supported) feature('unsupported_clef', { staff: Number(clef.attrs.number ?? 1) });
        }
        if (child(item, 'transpose')) feature('transposing');
        for (const ms of kids(item, 'measure-style')) if (child(ms, 'multiple-rest')) feature('multi_rest');
      } else if (item.name === 'note') {
        const staff = num(item, 'staff') ?? 1;
        const voice = text(child(item, 'voice')) || '1';
        const sv = `${staff}:${voice}`;
        const noteIndex = counters.get(sv) ?? 0;
        counters.set(sv, noteIndex + 1);
        const at = { ...here, staff, voice, noteIndex };
        const grace = Boolean(child(item, 'grace'));
        const chord = Boolean(child(item, 'chord'));
        const pitch = child(item, 'pitch');
        const tm = child(item, 'time-modification');
        const ties = new Set(kids(item, 'tie').map(t => t.attrs.type));
        if (!ties.size) for (const nt of kids(item, 'notations')) for (const t of kids(nt, 'tied')) ties.add(t.attrs.type);
        /** @type {NoteInfo} */
        const note = {
          part: partIndex, measure: number, measureIndex: mi, staff, voice, noteIndex,
          kind: pitch ? 'note' : child(item, 'unpitched') ? 'unpitched' : child(item, 'rest') ? 'rest' : 'invalid',
          step: null, alter: 0, octave: null, accidental: text(child(item, 'accidental')) || null,
          grace, chord, duration: 0, start: 0, absStart: 0, type: text(child(item, 'type')) || null, dots: kids(item, 'dot').length,
          timeMod: tm ? { actual: num(tm, 'actual-notes') ?? 1, normal: num(tm, 'normal-notes') ?? 1 } : null,
          tieStart: ties.has('start') || ties.has('continue'), tieStop: ties.has('stop') || ties.has('continue'),
          fifths: st.keyKnown ? st.fifths : null, divisions: st.divisions, order: order++, contextAlter: null,
        };
        if (pitch) {
          const step = text(child(pitch, 'step')); const octave = num(pitch, 'octave'); const alter = num(pitch, 'alter') ?? 0;
          if (!STEPS.includes(step) || octave === null || !Number.isInteger(octave) || octave < 0 || octave > 9) { note.kind = 'invalid'; raise('invalid_pitch', 'error', at); }
          else Object.assign(note, { step, octave, alter });
        } else if (note.kind === 'invalid') raise('invalid_note', 'error', at);
        const durationValue = num(item, 'duration');
        if (!grace) {
          if (durationValue === null || durationValue < 0) raise('missing_duration', 'error', at);
          else note.duration = durationValue;
        }
        if (chord) {
          if (!lastHead) raise('chord_without_note', 'error', at);
          else if (!grace && !lastHead.grace && Math.abs(lastHead.duration - note.duration) > EPS) raise('chord_duration_mismatch', 'warn', at);
          note.start = lastStart;
        } else {
          note.start = cursor; lastStart = cursor; lastHead = note;
          if (!grace) {
            const v = voices.get(sv) ?? { staff, voice, end: 0, any: false };
            if (v.any && note.start < v.end - EPS && !overlapReported.has(sv)) { overlapReported.add(sv); raise('voice_overlap', 'error', at); }
            v.end = Math.max(v.end, note.start + note.duration); v.any = true;
            voices.set(sv, v);
            cursor += note.duration; maxCursor = Math.max(maxCursor, cursor);
          }
        }
        note.absStart = partTime + note.start;
        // Shape against duration (whole-measure rests and grace notes carry no meaningful pair).
        const rest = child(item, 'rest');
        if (!grace && note.type && note.type in TYPE_QUARTERS && st.divisions && !(rest && rest.attrs.measure === 'yes')) {
          const dotFactor = 2 - 1 / 2 ** note.dots;
          const ratio = note.timeMod ? note.timeMod.normal / note.timeMod.actual : 1;
          const expected = TYPE_QUARTERS[note.type] * st.divisions * dotFactor * ratio;
          if (Math.abs(expected - note.duration) > (note.timeMod ? 1 : 0.5)) raise('type_duration_mismatch', 'warn', at, { type: note.type, found: note.duration, expected });
        }
        // Range: more than four ledger lines is suspicious for a printed part.
        if (note.kind === 'note' && note.step && note.octave !== null) {
          const p = staffPosition(st.clefs.get(staff), note.step, note.octave, st.shifts.get(staff) ?? 0);
          if (p !== null) {
            const ledgers = p >= 10 ? Math.floor((p - 8) / 2) : p <= -2 ? Math.floor(-p / 2) : 0;
            if (ledgers > 4) raise('range_suspicious', 'warn', at, { note: noteName(note.step, note.alter, note.octave), ledgerLines: ledgers, direction: p > 0 ? 'above' : 'below' });
          }
        }
        // Features NotaNota does not practise.
        if (grace) feature('grace_note', at);
        if (child(item, 'cue')) feature('cue_note', at);
        if (note.kind === 'unpitched') feature('unpitched', at);
        if (tm) feature('tuplet', at);
        if (child(item, 'lyric')) feature('lyrics', at);
        for (const c of item.children) if (!HARMLESS_NOTE_CHILDREN.has(c.name) && c.name !== 'lyric') feature('other', at);
        for (const nt of kids(item, 'notations')) {
          for (const c of nt.children) {
            if (c.name === 'tuplet' && !tm) feature('tuplet', at);
            else if (c.name === 'ornaments') feature(child(c, 'tremolo') ? 'tremolo' : 'ornament', at);
            else if (c.name === 'fermata') feature('fermata', at);
            else if (c.name === 'arpeggiate' || c.name === 'non-arpeggiate') feature('arpeggio', at);
            else if (c.name === 'glissando' || c.name === 'slide') feature('glissando', at);
            else if (c.name === 'articulations') feature('articulation', at);
            else if (c.name === 'technical') feature('technical', at);
            else if (c.name === 'dynamics') feature('dynamics', at);
            else if (c.name === 'accidental-mark') feature('ornament', at);
          }
        }
        // Tie sequences: onset groups per staff and voice (chord members join the head's group).
        if (!grace) {
          if (chord && lastGroup) lastGroup.push(note);
          else { const seq = sequences.get(sv) ?? []; lastGroup = [note]; seq.push(lastGroup); sequences.set(sv, seq); }
        }
        if (note.kind === 'note' && !grace && keySegments.length) keySegments[keySegments.length - 1].notes.push(note);
        else if (note.kind === 'note' && !grace) { keySegments.push({ fifths: st.fifths, measure: number, measureIndex: mi, notes: [note] }); }
        notes.push(note); measureNotes.push(note);
      } else if (item.name === 'backup') {
        cursor -= num(item, 'duration') ?? 0;
        if (cursor < -EPS) { raise('backup_underflow', 'error', here); cursor = 0; }
      } else if (item.name === 'forward') {
        const d = num(item, 'duration') ?? 0;
        const voice = text(child(item, 'voice'));
        if (voice) {
          const staff = num(item, 'staff') ?? 1; const sv = `${staff}:${voice}`;
          const v = voices.get(sv) ?? { staff, voice, end: 0, any: false };
          v.end = Math.max(v.end, cursor + d); voices.set(sv, v);
        }
        cursor += d; maxCursor = Math.max(maxCursor, cursor);
      } else if (item.name === 'direction') {
        const staff = num(item, 'staff') ?? 1;
        for (const dt of kids(item, 'direction-type')) {
          for (const c of dt.children) {
            if (c.name === 'dynamics') feature('dynamics', { staff });
            else if (c.name === 'wedge' && c.attrs.type !== 'stop') feature('hairpin', { staff });
            else if (c.name === 'words') feature('text_direction', { staff });
            else if (c.name === 'segno' || c.name === 'coda') feature('segno_coda');
            else if (c.name === 'pedal' && c.attrs.type !== 'stop') feature('pedal', { staff });
            else if (c.name === 'octave-shift') {
              const size = Number(c.attrs.size ?? 8);
              const steps = size >= 15 ? 14 : 7;
              if (c.attrs.type === 'down') st.shifts.set(staff, -steps);
              else if (c.attrs.type === 'up') st.shifts.set(staff, steps);
              else if (c.attrs.type === 'stop') st.shifts.delete(staff);
              if (c.attrs.type !== 'stop') feature('octave_shift', { staff });
            }
          }
        }
        const sound = child(item, 'sound');
        if (sound && ['dacapo', 'dalsegno', 'fine', 'tocoda'].some(a => a in sound.attrs)) feature('jump');
      } else if (item.name === 'sound') {
        if (['dacapo', 'dalsegno', 'fine', 'tocoda'].some(a => a in item.attrs)) feature('jump');
      } else if (item.name === 'barline') {
        if (child(item, 'repeat')) feature('repeat');
        if (child(item, 'ending')) feature('volta');
        if (child(item, 'fermata')) feature('fermata');
        if (child(item, 'segno') || child(item, 'coda')) feature('segno_coda');
      } else if (item.name === 'harmony') feature('chord_symbols');
      else if (item.name === 'figured-bass') feature('figured_bass');
    }

    // Accidentals in time order: printed signs carry to the end of the measure on the same staff and
    // octave; a note tied over takes the alter of the note it is tied from.
    const carry = new Map();
    for (const note of [...measureNotes].sort((a, b) => a.start - b.start || a.order - b.order)) {
      if (note.kind !== 'note' || note.step === null) continue;
      const pk = `${note.staff}:${note.step}${note.octave}`;
      const tk = `${note.staff}:${note.voice}:${note.step}${note.octave}`;
      let context = null; let source = null;
      if (note.tieStop && tieOpen.has(tk)) { context = tieOpen.get(tk); source = 'tie'; }
      else if (carry.has(pk)) { context = carry.get(pk); source = 'measure'; }
      else if (note.fifths !== null) { context = keyAlter(note.fifths, note.step); source = 'key'; }
      if (note.tieStop) tieOpen.delete(tk);
      if (note.tieStart) tieOpen.set(tk, note.alter);
      note.contextAlter = context;
      if (!Number.isInteger(note.alter)) continue;
      const at = { ...here, staff: note.staff, voice: note.voice, noteIndex: note.noteIndex };
      const shown = note.accidental !== null && note.accidental in ACCIDENTAL_ALTER ? ACCIDENTAL_ALTER[note.accidental] : null;
      if (shown !== null) {
        if (note.alter !== shown) raise('accidental_contradiction', 'error', at, { written: noteName(note.step, note.alter, note.octave, true), shown: noteName(note.step, shown, note.octave, true) });
        carry.set(pk, shown);
      } else if (note.accidental === null && context !== null && note.alter !== context) {
        if (encodesAccidentals) raise('alter_contradicts_key', 'warn', at, { source, written: noteName(note.step, note.alter, note.octave, true), expected: noteName(note.step, context, note.octave, true) });
        else chromaticWithoutSigns = true;
      }
    }

    for (const f of features.values()) {
      raise('needs_review', FEATURES[f.name][0], { ...here, staff: f.staff, voice: f.voice, noteIndex: f.noteIndex }, { feature: f.name, count: f.count });
    }
    const length = Math.max(maxCursor, cursor);
    measures.push({ index: mi, number, implicit: measure.attrs.implicit === 'yes', expected: st.time && st.divisions ? st.time.quarters * st.divisions : null, beatUnit: st.time && st.divisions ? (st.divisions * 4) / st.time.beatType : null, voices: [...voices.values()], length, hasNotes: measureNotes.length > 0 });
    partTime += length;
  });

  checkFullness(measures, raise);
  checkTies(notes, sequences, raise);
  checkKeySegments(keySegments, raise);
  if (chromaticWithoutSigns) raise('accidentals_not_encoded', 'info', {});
  return { index: partIndex, id: part.attrs.id ?? null, notes, measures, issues };
}

/** Only small, non-message values are copied onto an issue. */
function publicData(data) {
  const out = {};
  for (const k of ['feature', 'count', 'expected', 'found', 'source', 'ledgerLines', 'direction', 'suggestedFifths', 'fifths', 'pickup', 'type']) {
    if (k in data && (typeof data[k] !== 'object' || data[k] === null)) out[k] = data[k];
  }
  return out;
}

function checkFullness(measures, raise) {
  let pickup = null; let noTimeReported = false;
  measures.forEach((m, i) => {
    const here = { measure: m.number, measureIndex: m.index };
    if (m.expected === null) {
      if (!noTimeReported) { raise('no_time_signature', 'info', here); noTimeReported = true; }
      return;
    }
    if (!m.hasNotes && !m.voices.length) { raise('empty_measure', 'info', here); return; }
    const beats = v => v / m.beatUnit;
    const over = m.voices.filter(v => v.end > m.expected + EPS);
    for (const v of over) raise('measure_overfull', 'error', { ...here, staff: v.staff, voice: v.voice }, { found: beats(v.end), expected: beats(m.expected) });
    const maxEnd = Math.max(0, ...m.voices.map(v => v.end));
    let target = m.expected;
    if (maxEnd < m.expected - EPS && !over.length) {
      if (i === 0 || m.implicit) {
        raise('pickup_measure', 'info', here, { found: beats(maxEnd), expected: beats(m.expected) });
        if (i === 0) pickup = maxEnd;
        target = maxEnd;
      } else if (i === measures.length - 1 && pickup !== null && Math.abs(pickup + maxEnd - m.expected) < EPS) {
        raise('final_complement', 'info', here, { found: beats(maxEnd), pickup: beats(pickup), expected: beats(m.expected) });
        target = maxEnd;
      }
    }
    const mainOfStaff = new Map();
    for (const v of m.voices) if (!mainOfStaff.has(v.staff)) mainOfStaff.set(v.staff, v);
    for (const v of m.voices) {
      if (v.end > m.expected + EPS || v.end >= target - EPS) continue;
      const main = mainOfStaff.get(v.staff) === v;
      raise(main ? 'measure_underfull' : 'voice_incomplete', main ? 'warn' : 'info', { ...here, staff: v.staff, voice: v.voice }, { found: beats(v.end), expected: beats(m.expected) });
    }
  });
}

function checkTies(notes, sequences, raise) {
  const matched = new Set();
  const at = n => ({ measure: n.measure, measureIndex: n.measureIndex, staff: n.staff, voice: n.voice, noteIndex: n.noteIndex });
  const name = n => noteName(n.step, n.alter, n.octave);
  for (const seq of sequences.values()) {
    seq.forEach((group, gi) => {
      for (const n of group) {
        if (n.kind !== 'note' || !n.tieStart) continue;
        const next = seq[gi + 1] ?? [];
        const end = n.absStart + n.duration;
        let match = next.find(m => m.kind === 'note' && m.tieStop && !matched.has(m) && m.step === n.step && m.octave === n.octave);
        // Ties may pass between voices of one staff (keyboard writing): accept a stop that starts exactly where this note ends.
        match ??= notes.find(m => m !== n && m.kind === 'note' && !m.grace && m.tieStop && !matched.has(m) && m.staff === n.staff && m.step === n.step && m.octave === n.octave && Math.abs(m.absStart - end) < EPS);
        if (match) {
          matched.add(match);
          if (match.alter !== n.alter) raise('tie_pitch_mismatch', 'error', at(n), { note: name(n), other: name(match) });
          continue;
        }
        const other = next.find(m => m.kind === 'note' && m.tieStop && !matched.has(m));
        if (other) { matched.add(other); raise('tie_pitch_mismatch', 'error', at(n), { note: name(n), other: name(other) }); }
        else raise('tie_broken', 'error', at(n), { note: name(n) });
      }
    });
  }
  for (const n of notes) if (n.kind === 'note' && !n.grace && n.tieStop && !matched.has(n)) raise('tie_stop_without_start', 'warn', at(n), { note: name(n) });
}

/**
 * A key signature is suspect when steps that occur at least twice are always altered the same way,
 * at least three notes disagree with the signature, and another key explains every such step.
 */
function checkKeySegments(segments, raise) {
  for (const seg of segments) {
    if (!Number.isInteger(seg.fifths)) continue;
    /** @type {Map<string, number[]>} */
    const byStep = new Map();
    for (const n of seg.notes) if (Number.isInteger(n.alter)) byStep.set(n.step, [...(byStep.get(n.step) ?? []), n.alter]);
    const uniform = [...byStep].filter(([, alters]) => alters.length >= 2 && alters.every(a => a === alters[0]) && Math.abs(alters[0]) <= 1).map(([step, alters]) => ({ step, alter: alters[0], count: alters.length }));
    const violations = fifths => uniform.filter(u => keyAlter(fifths, u.step) !== u.alter);
    const current = violations(seg.fifths);
    if (current.reduce((a, u) => a + u.count, 0) < 3) continue;
    let best = null;
    for (let d = 1; d <= 14 && best === null; d++) {
      for (const k of [seg.fifths - d, seg.fifths + d]) if (Math.abs(k) <= 7 && best === null && violations(k).length === 0) best = k;
    }
    if (best === null) continue;
    const list = current.map(u => noteName(u.step, u.alter, '', true));
    raise('key_signature_suspect', 'warn', { measure: seg.measure, measureIndex: seg.measureIndex }, {
      key: keyName(seg.fifths), suggested: keyName(best), fifths: seg.fifths, suggestedFifths: best,
      steps: { tr: `her zaman ${list.map(l => l.tr).join(', ')}`, en: `always ${list.map(l => l.en).join(', ')}` },
    });
  }
}

/** @param {string|XmlNode} source */
function rootOf(source) {
  const root = typeof source === 'string' ? parseXml(source) : source;
  if (!root || typeof root !== 'object' || !Array.isArray(root.children)) throw new MusicXmlError('not_musicxml');
  if (root.name === 'score-timewise') throw new MusicXmlError('timewise_not_supported');
  if (root.name !== 'score-partwise') throw new MusicXmlError('not_musicxml');
  return root;
}

/**
 * Checks a MusicXML document (string, or the tree from `parseXml`) for musical consistency.
 * Throws MusicXmlError for documents `readMusicXml` would also refuse.
 * @param {string|XmlNode} source
 * @returns {{issues: Issue[], summary: {parts:number, measures:number, errors:number, warnings:number, infos:number,
 *   byCode: Record<string, number>, needsReview: {feature:string, measures:string[]}[], clean:boolean}}}
 */
export function checkScore(source) {
  const root = rootOf(source);
  const parts = kids(root, 'part').map((part, i) => analysePart(part, i));
  if (!parts.length) throw new MusicXmlError('no_parts');
  const rank = { error: 0, warn: 1, info: 2 };
  const issues = parts.flatMap(p => p.issues).sort((a, b) => a.part - b.part || (a.measureIndex ?? -1) - (b.measureIndex ?? -1) || rank[a.severity] - rank[b.severity]);
  /** @type {Record<string, number>} */
  const byCode = {};
  for (const i of issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1;
  /** @type {Map<string, Set<string>>} */
  const review = new Map();
  for (const i of issues) if (i.code === 'needs_review') review.set(String(i.feature), (review.get(String(i.feature)) ?? new Set()).add(String(i.measure)));
  const count = sev => issues.filter(i => i.severity === sev).length;
  const errors = count('error'); const warnings = count('warn');
  return {
    issues,
    summary: {
      parts: parts.length, measures: parts.reduce((a, p) => a + p.measures.length, 0), errors, warnings, infos: count('info'), byCode,
      needsReview: [...review].map(([feature, measures]) => ({ feature, measures: [...measures] })), clean: errors === 0 && warnings === 0,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Corrections: edit single notes in the original string, leaving every other byte untouched.

/** Calls `onTag(name, start, end, kind)` for each element tag, skipping comments, CDATA, PIs and DOCTYPE. */
function scanTags(source, onTag) {
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) break;
    if (source.startsWith('<?', lt)) { i = source.indexOf('?>', lt + 2) + 2; continue; }
    if (source.startsWith('<!--', lt)) { i = source.indexOf('-->', lt + 4) + 3; continue; }
    if (source.startsWith('<![CDATA[', lt)) { i = source.indexOf(']]>', lt + 9) + 3; continue; }
    if (source.startsWith('<!', lt)) { i = source.indexOf('>', lt) + 1; continue; }
    const end = tagEnd(source, lt + 1);
    const raw = source.slice(lt + 1, end);
    if (raw[0] === '/') onTag(raw.slice(1).trim(), lt, end + 1, 'close');
    else onTag(/^[^\s/>]+/.exec(raw)[0], lt, end + 1, raw.endsWith('/') ? 'empty' : 'open');
    i = end + 1;
  }
}
function tagEnd(source, from) {
  let quote = '';
  for (let j = from; j < source.length; j++) {
    const ch = source[j];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return j;
  }
  throw new MusicXmlError('malformed');
}

/** Byte ranges of every <note> that is a child of part/measure, in document order per part. */
function locateNotes(source) {
  /** @type {{start:number, end:number}[][]} */
  const parts = [];
  const stack = []; let open = null;
  scanTags(source, (name, start, end, kind) => {
    if (kind === 'close') {
      stack.pop();
      if (name === 'note' && open && stack.length === 3) { open.end = end; open = null; }
      return;
    }
    const depth = stack.length;
    if (name === 'part' && depth === 1) parts.push([]);
    if (name === 'note' && depth === 3 && stack[2] === 'measure' && stack[1] === 'part') {
      const span = { start, end: kind === 'empty' ? end : -1 };
      parts[parts.length - 1].push(span);
      if (kind === 'open') open = span;
    }
    if (kind === 'open') stack.push(name);
  });
  return parts;
}

/** Splits `<note …>…</note>` into its open tag, top-level children (raw text kept) and close tag. */
function splitNote(raw) {
  const openEnd = tagEnd(raw, 1) + 1;
  const closeStart = raw.lastIndexOf('</');
  const inner = raw.slice(openEnd, closeStart);
  /** @type {{name:string|null, raw:string}[]} */
  const segments = [];
  let depth = 0; let segStart = 0; let segName = null; let textStart = 0;
  scanTags(inner, (name, start, end, kind) => {
    if (depth === 0 && (kind === 'open' || kind === 'empty')) {
      if (start > textStart) segments.push({ name: null, raw: inner.slice(textStart, start) });
      segStart = start; segName = name;
    }
    if (kind === 'open') depth++;
    else if (kind === 'close') depth--;
    if (depth === 0) { segments.push({ name: segName, raw: inner.slice(segStart, end) }); textStart = end; }
  });
  if (textStart < inner.length) segments.push({ name: null, raw: inner.slice(textStart) });
  return { open: raw.slice(0, openEnd), segments, close: raw.slice(closeStart) };
}

function insertSegment(segments, name, raw) {
  const rank = NOTE_ORDER.indexOf(name);
  let at = segments.length;
  while (at > 0 && segments[at - 1].name === null) at--;
  for (let i = 0; i < segments.length; i++) {
    const r = segments[i].name ? NOTE_ORDER.indexOf(segments[i].name) : -1;
    if (r > rank) { at = i; break; }
  }
  segments.splice(at, 0, { name, raw });
}
const setSegment = (segments, name, raw) => {
  const i = segments.findIndex(s => s.name === name);
  if (i === -1) insertSegment(segments, name, raw); else segments[i] = { name, raw };
};
const removeSegments = (segments, names) => {
  for (let i = segments.length - 1; i >= 0; i--) if (segments[i].name && names.includes(segments[i].name)) segments.splice(i, 1);
};

/** The alter a reader would assume for `step`/`octave` at `note`, with no accidental printed on it. */
function contextAlterAt(note, measureNotes, step, octave) {
  let alter = note.fifths === null ? 0 : keyAlter(note.fifths, step);
  for (const m of measureNotes) {
    if (m === note || m.staff !== note.staff || m.kind !== 'note' || m.step !== step || m.octave !== octave) continue;
    if (m.start > note.start || (m.start === note.start && m.order > note.order)) continue;
    if (m.accidental && m.accidental in ACCIDENTAL_ALTER) alter = ACCIDENTAL_ALTER[m.accidental];
  }
  return alter;
}

const TYPE_RE = /^(maxima|long|breve|whole|half|quarter|eighth|16th|32nd|64th|128th|256th|512th|1024th)(\.{0,3})$/;

/**
 * @typedef {{part?:number|string, measure?:string|number, measureIndex?:number, staff?:number, voice?:string|number,
 *   noteIndex:number, set:{step?:string, alter?:number, octave?:number, duration?:number|string, rest?:boolean, accidental?:string|null}}} Correction
 * @typedef {{part:number, measure:string, staff:number, voice:string, noteIndex:number, field:string, from:unknown, to:unknown}} Change
 */

/**
 * Applies note corrections to a MusicXML string and returns a new string; the input is never modified,
 * so a recognition result and its corrections can be stored separately and replayed.
 * Only the addressed <note> elements are rewritten; every other byte stays as it was.
 * When the pitch changes, the printed accidental is set to what the key and the measure require
 * (`set.accidental` overrides: a MusicXML accidental name, or null / 'none' to remove it).
 * `duration` is a number of divisions or a note type with optional dots ('quarter', 'half.'); a type
 * also rewrites <type> and <dot/>. Corrections that cannot be applied are returned in `rejected`.
 * @param {string} musicxml
 * @param {Correction[]} corrections
 * @returns {{xml:string, changes:Change[], rejected:{correction:Correction, reason:string}[]}}
 */
export function applyCorrections(musicxml, corrections) {
  if (typeof musicxml !== 'string') throw new MusicXmlError('not_text');
  if (!Array.isArray(corrections)) throw new TypeError('corrections_must_be_an_array');
  const root = rootOf(musicxml);
  const partNodes = kids(root, 'part');
  const analysed = partNodes.map((p, i) => analysePart(p, i));
  const spans = locateNotes(musicxml);
  analysed.forEach((p, i) => { if ((spans[i]?.length ?? 0) !== p.notes.length) throw new Error('note_location_mismatch'); });

  /** @type {Map<NoteInfo, {raw:string, span:{start:number,end:number}}>} */
  const edited = new Map();
  /** @type {Change[]} */
  const changes = [];
  const rejected = [];
  for (const correction of corrections) {
    const reason = applyOne(correction);
    if (reason) rejected.push({ correction, reason });
  }

  function applyOne(c) {
    if (!c || typeof c !== 'object' || !c.set || typeof c.set !== 'object') return 'invalid_correction';
    const partIndex = typeof c.part === 'string' ? partNodes.findIndex(p => p.attrs.id === c.part) : c.part ?? 0;
    const part = analysed[partIndex];
    if (!part) return 'part_not_found';
    const measure = c.measureIndex !== undefined ? part.measures[c.measureIndex] : part.measures.find(m => m.number === String(c.measure));
    if (!measure) return 'measure_not_found';
    const staff = c.staff ?? 1; const voice = String(c.voice ?? '1');
    const noteAt = part.notes.findIndex(n => n.measureIndex === measure.index && n.staff === staff && n.voice === voice && n.noteIndex === c.noteIndex);
    if (noteAt === -1) return 'note_not_found';
    const note = part.notes[noteAt];
    const set = c.set;
    if (set.step !== undefined && !STEPS.includes(set.step)) return 'invalid_step';
    if (set.alter !== undefined && !(Number.isInteger(set.alter) && Math.abs(set.alter) <= 2)) return 'invalid_alter';
    if (set.octave !== undefined && !(Number.isInteger(set.octave) && set.octave >= 0 && set.octave <= 9)) return 'invalid_octave';
    if (set.accidental !== undefined && set.accidental !== null && set.accidental !== 'none' && !(set.accidental in ACCIDENTAL_ALTER)) return 'invalid_accidental';
    if (note.kind === 'unpitched' || note.kind === 'invalid') return 'unsupported_note';

    const entry = edited.get(note) ?? { raw: musicxml.slice(spans[partIndex][noteAt].start, spans[partIndex][noteAt].end), span: spans[partIndex][noteAt] };
    if (entry.raw.endsWith('/>')) return 'unsupported_note';
    const { open, segments, close } = splitNote(entry.raw);
    const parsed = parseXml(entry.raw);
    const pitchNode = child(parsed, 'pitch');
    const current = { rest: !pitchNode, step: pitchNode ? text(child(pitchNode, 'step')) : null, alter: pitchNode ? num(pitchNode, 'alter') ?? 0 : 0, octave: pitchNode ? num(pitchNode, 'octave') : null };
    const local = [];
    const where = { part: partIndex, measure: note.measure, staff, voice, noteIndex: note.noteIndex };
    const record = (field, from, to) => { if (from !== to) local.push({ ...where, field, from, to }); };

    const toRest = set.rest === true;
    const wantsPitch = set.rest === false || set.step !== undefined || set.octave !== undefined || set.alter !== undefined;
    if (toRest) {
      if (set.step !== undefined || set.octave !== undefined || set.alter !== undefined) return 'conflicting_values';
      if (!current.rest) {
        const i = segments.findIndex(s => s.name === 'pitch');
        segments[i] = { name: 'rest', raw: '<rest/>' };
        removeSegments(segments, ['tie', 'accidental']);
        const ni = segments.findIndex(s => s.name === 'notations');
        if (ni !== -1) {
          const stripped = segments[ni].raw.replace(/<tied\b[^>]*\/>|<tied\b[^>]*>[\s\S]*?<\/tied>/g, '');
          if (/^<notations\b[^>]*>\s*<\/notations>$/.test(stripped)) segments.splice(ni, 1); else segments[ni] = { name: 'notations', raw: stripped };
        }
        record('rest', false, true);
      }
    } else if (wantsPitch) {
      const step = set.step ?? current.step; const octave = set.octave ?? current.octave;
      if (!step || octave === null) return 'missing_pitch';
      const moved = step !== current.step || octave !== current.octave || current.rest;
      const measureNotes = part.notes.filter(n => n.measureIndex === note.measureIndex);
      const context = contextAlterAt(note, measureNotes, step, octave);
      const alter = set.alter ?? (moved ? context : current.alter);
      const pitchRaw = `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`;
      if (current.rest) {
        const i = segments.findIndex(s => s.name === 'rest');
        segments[i] = { name: 'pitch', raw: pitchRaw };
        record('rest', true, false);
      } else setSegment(segments, 'pitch', pitchRaw);
      record('step', current.rest ? null : current.step, step);
      record('octave', current.rest ? null : current.octave, octave);
      record('alter', current.rest ? null : current.alter, alter);
      const hadAccidental = segments.find(s => s.name === 'accidental');
      const before = hadAccidental ? text(child(parsed, 'accidental')) : null;
      let after = before;
      if (set.accidental !== undefined) after = set.accidental === 'none' ? null : set.accidental;
      else if (moved || alter !== current.alter) after = alter === context ? null : ALTER_ACCIDENTAL[alter] ?? null;
      if (after !== before) {
        if (after === null) removeSegments(segments, ['accidental']); else setSegment(segments, 'accidental', `<accidental>${after}</accidental>`);
        record('accidental', before, after);
      }
    }

    if (set.duration !== undefined) {
      if (note.grace) return 'grace_has_no_duration';
      const divisions = note.divisions;
      if (!divisions) return 'no_divisions';
      const ratio = note.timeMod ? note.timeMod.normal / note.timeMod.actual : 1;
      let duration; let type = null; let dots = 0;
      if (typeof set.duration === 'number') {
        if (!(set.duration > 0) || !Number.isInteger(set.duration)) return 'invalid_duration';
        duration = set.duration;
        for (const [t, q] of Object.entries(TYPE_QUARTERS)) for (let d = 0; d <= 2 && type === null; d++) if (Math.abs(q * divisions * (2 - 1 / 2 ** d) * ratio - duration) < EPS) { type = t; dots = d; }
      } else {
        const m = TYPE_RE.exec(String(set.duration));
        if (!m) return 'invalid_duration';
        type = m[1]; dots = m[2].length;
        duration = TYPE_QUARTERS[type] * divisions * (2 - 1 / 2 ** dots) * ratio;
        if (!Number.isInteger(Math.round(duration * 1e6) / 1e6)) return 'duration_not_representable';
        duration = Math.round(duration);
      }
      const beforeDuration = num(parsed, 'duration');
      setSegment(segments, 'duration', `<duration>${duration}</duration>`);
      record('duration', beforeDuration, duration);
      if (type) {
        const beforeType = text(child(parsed, 'type')) || null; const beforeDots = kids(parsed, 'dot').length;
        setSegment(segments, 'type', `<type>${type}</type>`);
        removeSegments(segments, ['dot']);
        const ti = segments.findIndex(s => s.name === 'type');
        segments.splice(ti + 1, 0, ...Array.from({ length: dots }, () => ({ name: 'dot', raw: '<dot/>' })));
        record('type', beforeType, type);
        record('dots', beforeDots, dots);
      }
    }

    const raw = open + segments.map(s => s.raw).join('') + close;
    parseXml(raw);
    edited.set(note, { raw, span: entry.span });
    changes.push(...local);
    return null;
  }

  const edits = [...edited.values()].sort((a, b) => b.span.start - a.span.start);
  let xml = musicxml;
  for (const e of edits) xml = xml.slice(0, e.span.start) + e.raw + xml.slice(e.span.end);
  readMusicXml(xml);
  return { xml, changes, rejected };
}
