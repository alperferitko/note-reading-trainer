// Original short studies, not excerpts from named works.
//
// Each measure is a space-separated list of tokens: `<pitch><accidental?><duration>`.
//   pitch      staff step in the study's clef (0 = bottom line; treble 0 = E4, bass 0 = G2) or `r` for a rest
//   accidental `#` sharp, `b` flat, `n` natural (written explicitly on the staff)
//   duration   w whole, h half, q quarter, q. dotted quarter, e eighth, s sixteenth, t eighth-note triplet
// Written accidentals last until the bar line for the same staff position; the key signature applies otherwise.

/**
 * @typedef {'whole'|'half'|'quarter'|'dottedQuarter'|'eighth'|'sixteenth'|'triplet'} StudyRhythm
 * @typedef {{id:string, level:number, requires:string[], clef:'treble'|'bass', time:[number, number], key:number,
 *   title:{tr:string,en:string}, focus:{tr:string,en:string}, tip:{tr:string,en:string}, measures:string[]}} ReadingStudy
 * @typedef {{index:number, type:'note'|'rest', rhythm:StudyRhythm, measure:number, startTick:number, barAfter:boolean,
 *   groupId?:string, position?:number, accidental?:number, writtenAccidental?:number, afterRest:boolean}} StudyEvent
 */

export const TICKS_PER_QUARTER = 12;
/** @type {Record<StudyRhythm, number>} */
export const RHYTHM_TICKS = Object.freeze({ whole: 48, half: 24, quarter: 12, dottedQuarter: 18, eighth: 6, sixteenth: 3, triplet: 4 });
const DURATIONS = /** @type {Record<string, StudyRhythm>} */ ({ w: 'whole', h: 'half', q: 'quarter', 'q.': 'dottedQuarter', e: 'eighth', s: 'sixteenth', t: 'triplet' });
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const TOKEN = /^(r|-?\d{1,2})([#bn]?)(q\.|[whqest])$/;

/** @param {'treble'|'bass'} clef @param {number} position */
export function letterAt(clef, position) {
  const index = (clef === 'bass' ? 18 : 30) + position;
  return LETTERS[((index % 7) + 7) % 7];
}

/** Accidental a key signature gives to a letter: positive counts are sharps, negative counts are flats. */
export function keySignatureAccidental(letter, key) {
  if (key > 0) return SHARP_ORDER.slice(0, key).includes(letter) ? 1 : 0;
  if (key < 0) return FLAT_ORDER.slice(0, -key).includes(letter) ? -1 : 0;
  return 0;
}

/** Staff steps where key-signature symbols are drawn, in order, for the given clef. */
export function keySignaturePositions(clef, key) {
  const sharps = clef === 'bass' ? [6, 3, 7, 4, 1, 5, 2] : [8, 5, 9, 6, 3, 7, 4];
  const flats = clef === 'bass' ? [2, 5, 1, 4, 0, 3, -1] : [4, 7, 3, 6, 2, 5, 1];
  return key > 0 ? sharps.slice(0, key) : key < 0 ? flats.slice(0, -key) : [];
}

export function measureTicks([beats, unit]) {
  return beats * (TICKS_PER_QUARTER * 4 / unit);
}

/**
 * Turns a study into timed note and rest events. Problems are returned rather
 * than thrown so tests can report every invalid measure at once.
 * @param {ReadingStudy} study
 * @returns {{events: StudyEvent[], problems: string[]}}
 */
export function parseStudy(study) {
  /** @type {StudyEvent[]} */
  const events = [];
  /** @type {string[]} */
  const problems = [];
  const target = measureTicks(study.time);
  study.measures.forEach((measure, measureIndex) => {
    const carried = new Map();
    let tick = 0;
    const tokens = measure.trim().split(/\s+/);
    tokens.forEach((token, tokenIndex) => {
      const match = TOKEN.exec(token);
      if (!match) { problems.push(`${study.id} m${measureIndex + 1}: invalid token "${token}"`); return; }
      const rhythm = DURATIONS[match[3]];
      const previous = events.at(-1);
      /** @type {StudyEvent} */
      const event = {
        index: events.length, type: match[1] === 'r' ? 'rest' : 'note', rhythm, measure: measureIndex,
        startTick: tick, barAfter: tokenIndex === tokens.length - 1, afterRest: previous?.type === 'rest',
      };
      if (event.type === 'note') {
        const position = Number(match[1]);
        const written = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : match[2] === 'n' ? 0 : undefined;
        if (written !== undefined) carried.set(position, written);
        event.position = position;
        event.writtenAccidental = written;
        event.accidental = carried.has(position) ? carried.get(position) : keySignatureAccidental(letterAt(study.clef, position), study.key);
      } else if (match[2]) problems.push(`${study.id} m${measureIndex + 1}: a rest cannot carry an accidental`);
      events.push(event);
      tick += RHYTHM_TICKS[rhythm];
    });
    if (tick !== target) problems.push(`${study.id} m${measureIndex + 1}: ${tick} ticks instead of ${target}`);
  });
  groupBeams(study.id, events, problems);
  return { events, problems };
}

// Beams join notes of one value inside one quarter-note beat, never across a rest or a bar line.
/** @param {string} id @param {StudyEvent[]} events @param {string[]} problems */
function groupBeams(id, events, problems) {
  const sizes = { eighth: 2, sixteenth: 4, triplet: 3 };
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const size = sizes[/** @type {keyof typeof sizes} */ (event.rhythm)];
    if (!size || event.groupId) continue;
    const run = events.slice(i, i + size);
    const complete = run.length === size && event.startTick % TICKS_PER_QUARTER === 0
      && run.every(item => item.type === 'note' && item.rhythm === event.rhythm && item.measure === event.measure);
    if (complete) run.forEach(item => { item.groupId = `${id}-beam-${i}`; });
    else if (event.rhythm === 'triplet') problems.push(`${id} m${event.measure + 1}: triplets must fill one beat with three notes`);
  }
}

/** @param {ReadingStudy} study */
export function studyEventCounts(study) {
  const { events } = parseStudy(study);
  return { notes: events.filter(event => event.type === 'note').length, rests: events.filter(event => event.type === 'rest').length };
}

/**
 * The next study whose prerequisites are complete and which has not been completed yet.
 * @param {string[]} completedIds
 */
export function nextStudy(completedIds = []) {
  const done = new Set(completedIds);
  return READING_STUDIES.find(study => !done.has(study.id) && study.requires.every(id => done.has(id))) ?? null;
}

/** @type {ReadingStudy[]} */
export const READING_STUDIES = [
  {
    id: 'steps', level: 1, requires: [], clef: 'treble', time: [4, 4], key: 0,
    title: { tr: 'Komşu notalar', en: 'Neighbouring notes' },
    focus: { tr: 'Çizgiden aralığa adım adım ilerleme', en: 'Moving line to space, step by step' },
    tip: { tr: 'Nota başlarını takip et. Her adım bir sonraki çizgiye veya aralığa gider. Önce kendi hızında oku, sonra düşük tempoda dene.', en: 'Follow the noteheads. Each step moves to the next line or space. Read at your own pace first, then try a slow tempo.' },
    measures: ['0q 1q 2q 3q', '4h 3q 2q', '1q 2q 1q 0q', '0w'],
  },
  {
    id: 'ledger', level: 2, requires: ['steps'], clef: 'treble', time: [4, 4], key: 0,
    title: { tr: 'İlk ek çizgiler', en: 'First ledger lines' },
    focus: { tr: 'Portenin hemen altı ve üstü', en: 'Just below and above the staff' },
    tip: { tr: 'Alt ek çizgideki Do ile üst ek çizgideki La konumlarını karşılaştır. Sıçramalarda nota başını yeniden bul; sapın ucundan okuma.', en: 'Compare C on the lower ledger line with A on the upper ledger line. Locate each notehead after a leap, rather than reading the stem tip.' },
    measures: ['-2q -1q 0q 1q', '0q -1q -2h', '8q 9q 10q 9q', '8q 10q -2h'],
  },
  {
    id: 'subdivide', level: 3, requires: ['ledger'], clef: 'treble', time: [4, 4], key: 0,
    title: { tr: 'Vuruş içinde farklı notalar', en: 'Different notes within a beat' },
    focus: { tr: 'Sekizlik ve onaltılık grupları', en: 'Eighth and sixteenth groups' },
    tip: { tr: 'İki sekizlik ve dört onaltılık aynı bir dörtlük vuruşa sığar. Metronom hızını değiştirme; her gruptaki farklı nota başlarını sırayla oku.', en: 'Two eighths or four sixteenths fit one quarter-note beat. Keep the metronome steady and read each different notehead in order.' },
    measures: ['0q 2q 1e 2e 3q', '4s 3s 2s 1s 0q 2e 4e 3q', '2q 1e 0e 2h', '1e 2e 3e 4e 3h'],
  },
  {
    id: 'quarter-rests', level: 4, requires: ['subdivide'], clef: 'treble', time: [4, 4], key: 0,
    title: { tr: 'Dörtlük suslar', en: 'Quarter rests' },
    focus: { tr: 'Sessizlikte vuruşu sürdürmek', en: 'Keeping the pulse through silence' },
    tip: { tr: 'Sus, sessiz bir vuruştur; zaman durmaz. Susta nota işaretleme, içinden say ve sonraki notaya tam vaktinde gir.', en: 'A rest is a silent beat; time does not stop. Do not mark a note during the rest, count it inside and enter the next note on time.' },
    measures: ['0q rq 2q rq', '4q 3q rh', '2q rq 1q rq', '0h rh'],
  },
  {
    id: 'mixed-rests', level: 5, requires: ['quarter-rests'], clef: 'treble', time: [4, 4], key: 0,
    title: { tr: 'Farklı sus değerleri', en: 'Different rest values' },
    focus: { tr: 'İkilik, birlik ve sekizlik sus', en: 'Half, whole and eighth rests' },
    tip: { tr: 'İkilik sus iki, birlik sus dört vuruş sürer. Sekizlik sustan sonra gelen nota vuruşun ikinci yarısındadır; girişini erken yapma.', en: 'A half rest lasts two beats and a whole rest four. A note after an eighth rest falls on the second half of the beat; do not enter early.' },
    measures: ['0e 1e 2q rq 4q', 'rh 3q 2q', 're 2e 3q rq 2q', 'rw', '1e 2e 3e 1e rq 0q'],
  },
  {
    id: 'three-four', level: 6, requires: ['mixed-rests'], clef: 'treble', time: [3, 4], key: 0,
    title: { tr: 'Üç vuruşluk ölçü', en: 'Three beats in a bar' },
    focus: { tr: '3/4 ölçü ve noktalı dörtlük', en: '3/4 time and the dotted quarter' },
    tip: { tr: '3/4 ölçüde her ölçü üç dörtlük vuruştur. Noktalı dörtlük bir buçuk vuruş sürer; ardından gelen sekizlik vuruşun ikinci yarısındadır.', en: 'In 3/4 each bar holds three quarter-note beats. A dotted quarter lasts one and a half beats; the eighth after it falls on the second half of a beat.' },
    measures: ['0h 2q', '4q. 3e 2q', '1q rq 3q', '2h rq'],
  },
  {
    id: 'key-g', level: 7, requires: ['three-four'], clef: 'treble', time: [4, 4], key: 1,
    title: { tr: 'Donanımda bir diyez', en: 'One sharp in the key signature' },
    focus: { tr: 'Sol majör donanımı: bütün Fa’lar diyez', en: 'G major key signature: every F is sharp' },
    tip: { tr: 'Anahtarın yanındaki diyez, satırdaki bütün Fa notalarını Fa♯ yapar. Fa gördüğünde ♯ seçmeyi unutma; nota başında ayrıca işaret yazmaz.', en: 'The sharp beside the clef makes every F on the line F♯. Choose ♯ whenever you see F; the notehead itself carries no extra sign.' },
    measures: ['2q 3q 4q 5q', '6q 7q 8h', '7q 6q 5q 4q', '3q 1q 2h'],
  },
  {
    id: 'key-f', level: 8, requires: ['key-g'], clef: 'treble', time: [4, 4], key: -1,
    title: { tr: 'Donanımda bir bemol', en: 'One flat in the key signature' },
    focus: { tr: 'Fa majör donanımı: bütün Si’ler bemol', en: 'F major key signature: every B is flat' },
    tip: { tr: 'Donanımdaki bemol, orta çizgideki Si’yi Si♭ yapar. Önce donanımı oku, sonra notaları; işaret bütün satır boyunca geçerlidir.', en: 'The flat in the key signature turns the middle-line B into B♭. Read the key signature before the notes; it applies to the whole line.' },
    measures: ['1q 2q 3q 4q', '5h 4q 3q', '2q rq 4q 2q', '1w'],
  },
  {
    id: 'accidentals-measure', level: 9, requires: ['key-f'], clef: 'treble', time: [4, 4], key: 0,
    title: { tr: 'Değiştirici ölçü sonuna kadar', en: 'Accidentals last to the bar line' },
    focus: { tr: 'Yazılı ♯, ♭ ve ♮ işaretlerinin süresi', en: 'How long written ♯, ♭ and ♮ apply' },
    tip: { tr: 'Nota başının önündeki işaret, aynı ölçüde aynı konumdaki sonraki notalar için de geçerlidir. Ölçü çizgisi işareti sıfırlar; natürel (♮) onu ölçü içinde kaldırır.', en: 'A sign before a notehead also applies to later notes at the same position in that bar. The bar line resets it; a natural (♮) cancels it within the bar.' },
    measures: ['1q 1#q 2q 1q', '3q 4bq 3q 4q', '4q 4bq 4nq rq', '2q 1#e 2e 1h'],
  },
  {
    id: 'bass-steps', level: 10, requires: ['accidentals-measure'], clef: 'bass', time: [4, 4], key: 0,
    title: { tr: 'Fa anahtarında adımlar', en: 'Steps in bass clef' },
    focus: { tr: 'Fa anahtarında komşu notalar ve sus', en: 'Neighbouring notes and rests in bass clef' },
    tip: { tr: 'Fa anahtarında en alt çizgi Sol, iki noktanın çevrelediği çizgi Fa’dır. Sol anahtarındaki adları taşıma; önce anahtarı kontrol et.', en: 'In bass clef the bottom line is G and the line between the dots is F. Do not carry over treble-clef names; check the clef first.' },
    measures: ['2q 3q 4q 5q', '6h 5q 4q', '3q rq 2q 1q', '2w'],
  },
];
