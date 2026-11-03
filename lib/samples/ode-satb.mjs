// Beethoven, "Ode to Joy", SATB hymn setting: Mutopia Project #528, typeset by Peter Chubb, public domain.
// Source page: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528
// Encoded by hand from the LilyPond source (ode.ly). tests/ode-satb.test.mjs reads that source
// independently and checks every note of every voice against this encoding.
//
// Token: pitch[@beats][(|)]. Pitch = step, optional accidental (# sharp, b flat, n natural sign), octave.
// Beats default to one quarter. "(" starts a slur, ")" ends one. Key G major, 4/4, crotchet = 100.

export const ODE_SOURCE = Object.freeze({
  title: 'Ode to Joy',
  composer: 'L. v. Beethoven',
  arrangement: 'SATB hymn setting, metre 8 7 8 7 D',
  mutopiaId: 528,
  typesetter: 'Peter Chubb',
  licence: 'Public Domain',
  page: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528',
  pdf: 'https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode-a4.pdf',
  lily: 'https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly',
  fifths: 1,
  beats: 4,
  tempo: 100,
});

export const ODE_VOICES = Object.freeze([
  { id: 'soprano', clef: 'treble', name: { tr: 'Soprano', en: 'Soprano' }, bars: [
    'B4 B4 C5 D5', 'D5 C5 B4 A4', 'G4 G4 A4 B4', 'B4@1.5 A4@0.5 A4@2',
    'B4 B4 C5 D5', 'D5 C5 B4 A4', 'G4 G4 A4 B4', 'A4@1.5 G4@0.5 G4@2',
    'A4 A4 B4 G4', 'A4 B4@0.5( C5@0.5) B4 G4', 'A4 B4@0.5( C5@0.5) B4 A4', 'G4 A4 D4@2',
    'B4 B4 C5 D5', 'D5 C5 B4 A4', 'G4 G4 A4 B4', 'A4@1.5 G4@0.5 G4@2'] },
  { id: 'alto', clef: 'treble', name: { tr: 'Alto', en: 'Alto' }, bars: [
    'G4 G4 A4 G4', 'G4@1.5 A4@0.5 G4 F#4', 'D4 D4 F#4 G4', 'G4@1.5 F#4@0.5 F#4@2',
    'G4 G4 A4 G4', 'G4@1.5 A4@0.5 G4 F#4', 'D4 D4 F#4 G4', 'G4 F#4 D4@2',
    'D4 D4 D4 D4', 'D4 D4 D4 D4', 'D4 D4 F#4 F#4', 'E4 C#4 D4@2',
    'D4 G4 A4 A4', 'B4 G4@0.5( A4@0.5) G4 E4', 'E4 D4 F#4 G4', 'G4 F#4 G4@2'] },
  { id: 'tenor', clef: 'bass', name: { tr: 'Tenor', en: 'Tenor' }, bars: [
    'D4 D4 C4 B3', 'E4@1.5 D4@0.5 D4 D4', 'B3 B3 D4 D4', 'D4@1.5 D4@0.5 D4@2',
    'D4 D4 C4 B3', 'E4@1.5 D4@0.5 D4 D4', 'B3 B3 D4 D4', 'D4 D4 B3@2',
    'F#3 F#3 G3 E3', 'F#3 G3@0.5( A3@0.5) G3 E3', 'F#3 F#3 F#3 B3', 'B3 A3 G3( F#3)',
    'G3 D4 Fn4 Fn4', 'G4@1.5 D4@0.5 D4 C4', 'G3 G3 C4 D4', 'D4 D4 B3@2'] },
  { id: 'bass', clef: 'bass', name: { tr: 'Bas', en: 'Bass' }, bars: [
    'G3 G3 G3 G3', 'E3@1.5 F#3@0.5 G3 D3', 'B3 B3 A3 G3', 'D3@1.5 D3@0.5 D3@2',
    'G3 G3 G3 G3', 'E3@1.5 F#3@0.5 G3 D3', 'B3 B3 A3 G3', 'D3 D3 G2@2',
    'D3 D3 D3 D3', 'D3 D3 D3 D3', 'D3 D3 D#3 D#3', 'E3 A2 D3@2',
    'G3 G3 Fn3 Fn3', 'E3@1.5 F#3@0.5 G3 C3', 'C3 B2 A2 G2', 'D3 D3 G2@2'] },
]);

const TOKEN = /^([A-G])([#bn]?)(\d)(?:@([\d.]+))?([()]?)$/;
const KEY_ALTER = { F: 1 }; // G major

/** One note: step, alter (actual pitch), whether a sign is printed, octave, beats, slur mark. */
export function parseToken(token) {
  const m = TOKEN.exec(token);
  if (!m) throw new Error(`bad token ${token}`);
  const [, step, sign, octave, beats, slur] = m;
  const alter = sign === '#' ? 1 : sign === 'b' ? -1 : sign === 'n' ? 0 : (KEY_ALTER[step] ?? 0);
  return { step, alter, octave: Number(octave), beats: beats ? Number(beats) : 1, slur: slur === '(' ? 'start' : slur === ')' ? 'stop' : null };
}

/** Bars of one voice as note objects, with any user corrections (key "bar:index") applied. */
export function voiceBars(voiceId, corrections = {}) {
  const voice = ODE_VOICES.find((v) => v.id === voiceId);
  if (!voice) throw new Error(`unknown voice ${voiceId}`);
  return voice.bars.map((bar, b) => bar.split(' ').map((token, i) => ({ ...parseToken(token), ...(corrections[`${b}:${i}`] ?? {}) })));
}

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** A note moved by `steps` diatonic steps; the accidental follows the key signature. */
export function stepNote(note, steps) {
  let index = STEPS.indexOf(note.step) + steps, octave = note.octave;
  while (index < 0) { index += 7; octave -= 1; }
  while (index > 6) { index -= 7; octave += 1; }
  const step = STEPS[index];
  return { ...note, step, octave, alter: KEY_ALTER[step] ?? 0 };
}

const TYPE = { 0.5: ['eighth', 0], 1: ['quarter', 0], 1.5: ['quarter', 1], 2: ['half', 0], 3: ['half', 1], 4: ['whole', 0] };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** MusicXML for one voice (a single part), so it can be practised bar by bar. Divisions: 2 per quarter. */
export function voiceMusicXml(voiceId, { corrections = {}, locale = 'tr' } = {}) {
  const voice = ODE_VOICES.find((v) => v.id === voiceId);
  const bars = voiceBars(voiceId, corrections);
  const clef = voice.clef === 'bass' ? '<sign>F</sign><line>4</line>' : '<sign>G</sign><line>2</line>';
  const measures = bars.map((notes, b) => {
    const attrs = b === 0 ? `<attributes><divisions>2</divisions><key><fifths>${ODE_SOURCE.fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef>${clef}</clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${ODE_SOURCE.tempo}</per-minute></metronome></direction-type><sound tempo="${ODE_SOURCE.tempo}"/></direction>` : '';
    const body = notes.map((n) => {
      const [type, dots] = TYPE[n.beats] ?? ['quarter', 0];
      const shown = (KEY_ALTER[n.step] ?? 0) !== n.alter;
      const acc = shown ? `<accidental>${n.alter === 1 ? 'sharp' : n.alter === -1 ? 'flat' : 'natural'}</accidental>` : '';
      const slur = n.slur ? `<notations><slur type="${n.slur}" number="1"/></notations>` : '';
      return `<note><pitch><step>${n.step}</step>${n.alter ? `<alter>${n.alter}</alter>` : ''}<octave>${n.octave}</octave></pitch><duration>${Math.round(n.beats * 2)}</duration><voice>1</voice><type>${type}</type>${dots ? '<dot/>' : ''}${acc}${slur}</note>`;
    }).join('');
    const barline = b === bars.length - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : [3, 7, 11].includes(b) ? '<barline location="right"><bar-style>light-light</bar-style></barline>' : '';
    return `<measure number="${b + 1}">${attrs}${body}${barline}</measure>`;
  }).join('\n');
  const partName = `${voice.name[locale]}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<work><work-title>${esc(ODE_SOURCE.title)}</work-title></work>
<identification><creator type="composer">${esc(ODE_SOURCE.composer)}</creator><rights>Public Domain. Mutopia Project #${ODE_SOURCE.mutopiaId}, typeset by ${esc(ODE_SOURCE.typesetter)}.</rights></identification>
<part-list><score-part id="P1"><part-name>${esc(partName)}</part-name></score-part></part-list>
<part id="P1">
${measures}
</part>
</score-partwise>`;
}

/** All four voices as one score (four parts), for showing the whole setting. */
export function satbMusicXml(locale = 'tr') {
  const parts = ODE_VOICES.map((v, i) => {
    const one = voiceMusicXml(v.id, { locale });
    return { list: `<score-part id="P${i + 1}"><part-name>${esc(v.name[locale])}</part-name></score-part>`, body: one.slice(one.indexOf('<part id="P1">')).replace('<part id="P1">', `<part id="P${i + 1}">`).replace('</score-partwise>', '').trim() };
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<work><work-title>${esc(ODE_SOURCE.title)}</work-title></work>
<identification><creator type="composer">${esc(ODE_SOURCE.composer)}</creator><rights>Public Domain. Mutopia Project #${ODE_SOURCE.mutopiaId}.</rights></identification>
<part-list>${parts.map((p) => p.list).join('')}</part-list>
${parts.map((p) => p.body).join('\n')}
</score-partwise>`;
}
