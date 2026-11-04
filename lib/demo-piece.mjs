import { namesLocale } from './music-pitch.mjs';
// One short original melody, written for NotaNota. The printed page, the digital staff, the sound
// and the MusicXML handed to the score workspace all come from DEMO_PIECE, so they cannot disagree.
// It carries a sharp, a flat, rests, eighth notes and a dotted half so the comparison shows real notation.

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

const n = (id, step, octave, beats, extra = {}) => Object.freeze({ id, step, octave, beats, alter: 0, dots: 0, rest: false, ...extra });
const r = (id, beats) => Object.freeze({ id, rest: true, beats, dots: 0 });

export const DEMO_PIECE = Object.freeze({
  title: { tr: 'Küçük Yürüyüş', en: 'Little Walk' },
  composer: 'NotaNota',
  tempo: 84,
  beatsPerMeasure: 4,
  notes: Object.freeze([
    n('n1', 'G', 4, 1), n('n2', 'A', 4, 0.5), n('n3', 'B', 4, 0.5), n('n4', 'C', 5, 1), r('r1', 1),
    n('n5', 'B', 4, 1, { alter: -1 }), n('n6', 'A', 4, 0.5), n('n7', 'G', 4, 0.5), n('n8', 'F', 4, 2, { alter: 1 }),
    n('n9', 'G', 4, 3, { dots: 1 }), r('r2', 1),
  ]),
});

/** Staff position counted in steps from the bottom line of the treble staff (E4 = 0). */
export function staffPosition({ step, octave }) {
  return octave * 7 + STEPS.indexOf(step) - (4 * 7 + 2);
}

export function midiOf({ step, octave, alter = 0 }) {
  return 12 * (octave + 1) + SEMITONES[STEPS.indexOf(step)] + alter;
}

export function noteLabel({ step, alter = 0 }, locale = 'tr') {
  const base = namesLocale(locale) === 'tr' ? SOLFEGE[STEPS.indexOf(step)] : step;
  return base + (alter === 1 ? '♯' : alter === -1 ? '♭' : '');
}

/** Start time (in beats) of each event, for the playhead and the sound. */
export function schedule(notes = DEMO_PIECE.notes) {
  let at = 0;
  return notes.map((note) => { const start = at; at += note.beats; return { ...note, start }; });
}

export function totalBeats(notes = DEMO_PIECE.notes) {
  return notes.reduce((sum, note) => sum + note.beats, 0);
}

export function measureCount(notes = DEMO_PIECE.notes, beatsPerMeasure = DEMO_PIECE.beatsPerMeasure) {
  return Math.max(1, Math.ceil(totalBeats(notes) / beatsPerMeasure));
}

/** Lays events out per measure: x runs 0..1 over the music area, measures share it evenly. */
export function layout(notes = DEMO_PIECE.notes, beatsPerMeasure = DEMO_PIECE.beatsPerMeasure) {
  const measures = measureCount(notes, beatsPerMeasure);
  return schedule(notes).map((note) => {
    const measureIndex = Math.floor(note.start / beatsPerMeasure);
    const inMeasure = note.start - measureIndex * beatsPerMeasure;
    return {
      ...note,
      measure: measureIndex + 1,
      position: note.rest ? null : staffPosition(note),
      x: (measureIndex + (inMeasure + 0.45) / beatsPerMeasure) / measures,
    };
  });
}

const TYPES = { 0.5: ['eighth', 0], 1: ['quarter', 0], 2: ['half', 0], 3: ['half', 1], 4: ['whole', 0] };

export function toMusicXml(notes = DEMO_PIECE.notes, piece = DEMO_PIECE) {
  const byMeasure = new Map();
  for (const note of schedule(notes)) {
    const number = Math.floor(note.start / piece.beatsPerMeasure) + 1;
    if (!byMeasure.has(number)) byMeasure.set(number, []);
    byMeasure.get(number).push(note);
  }
  const measures = [...byMeasure.entries()].map(([number, list]) => {
    const attributes = number === 1
      ? `<attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>${piece.beatsPerMeasure}</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${piece.tempo}</per-minute></metronome></direction-type><sound tempo="${piece.tempo}"/></direction>`
      : '';
    const body = list.map((e) => {
      const [type, dots] = TYPES[e.beats] ?? ['quarter', 0];
      const dot = dots ? '<dot/>' : '';
      if (e.rest) return `<note><rest/><duration>${e.beats * 2}</duration><voice>1</voice><type>${type}</type>${dot}</note>`;
      const alter = e.alter ? `<alter>${e.alter}</alter>` : '';
      const accidental = e.alter === 1 ? '<accidental>sharp</accidental>' : e.alter === -1 ? '<accidental>flat</accidental>' : '';
      return `<note><pitch><step>${e.step}</step>${alter}<octave>${e.octave}</octave></pitch><duration>${e.beats * 2}</duration><voice>1</voice><type>${type}</type>${dot}${accidental}</note>`;
    }).join('');
    return `<measure number="${number}">${attributes}${body}</measure>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>${piece.title.tr}</work-title></work><identification><creator type="composer">${piece.composer}</creator><rights>Original melody written for NotaNota.</rights></identification><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>\n`;
}
