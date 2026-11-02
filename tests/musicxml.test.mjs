import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFile, parseXml, practiceEvents, practiceQueue, readMusicXml, supportSummary, MAX_FILE_BYTES, MusicXmlError } from '../lib/musicxml.mjs';

const doc = (measures, { attributes = '<divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>', head = '' } = {}) =>
  `<?xml version="1.0" encoding="UTF-8"?>${head}
<score-partwise version="4.0">
  <work><work-title>Ode &amp; Joy</work-title></work>
  <identification><creator type="composer">L. van Beethoven</creator></identification>
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">${measures.map((m, i) => `<measure number="${i + 1}">${i === 0 ? `<attributes>${attributes}</attributes>` : ''}${m}</measure>`).join('')}</part>
</score-partwise>`;
const n = (step, octave, { alter = 0, duration = 1, extra = '' } = {}) =>
  `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice><type>quarter</type>${extra}</note>`;
const rest = (duration = 1) => `<note><rest/><duration>${duration}</duration><voice>1</voice></note>`;

test('reads title, composer, parts and single-line notes with positions and MIDI', () => {
  const score = readMusicXml(doc([n('E', 4) + n('F', 4, { alter: 1 }) + rest() + n('G', 4), n('C', 5, { duration: 4 })], { head: '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">' }));
  assert.equal(score.title, 'Ode & Joy');
  assert.equal(score.composer, 'L. van Beethoven');
  assert.equal(score.parts[0].name, 'Violin');
  const measures = practiceEvents(score.parts[0]);
  assert.equal(measures.length, 2);
  assert.ok(measures.every(m => m.supported));
  const queue = practiceQueue(measures);
  assert.deepEqual(queue.map(e => [e.step, e.alter, e.midi, e.position, e.measureNumber]), [['E', 0, 64, 0, '1'], ['F', 1, 66, 1, '1'], ['G', 0, 67, 2, '1'], ['C', 0, 72, 5, '2']]);
  assert.equal(measures[1].events[0].beats, 4);
});

test('bass clef notes are placed on the bass staff', () => {
  const score = readMusicXml(doc([n('G', 2) + n('C', 3)], { attributes: '<divisions>1</divisions><clef><sign>F</sign><line>4</line></clef>' }));
  const [first, second] = practiceQueue(practiceEvents(score.parts[0]));
  assert.equal(first.clef, 'bass'); assert.equal(first.position, 0); assert.equal(second.position, 3);
});

test('chords, several voices, unsupported clefs and double accidentals are excluded and named', () => {
  const chord = n('C', 4) + n('E', 4, { extra: '<chord/>' });
  const voices = n('C', 5) + '<backup><duration>1</duration></backup>' + n('C', 4).replace('<voice>1</voice>', '<voice>2</voice>');
  const doubleSharp = n('F', 4, { alter: 2 });
  const score = readMusicXml(doc([chord, voices, doubleSharp, n('D', 4)]));
  const measures = practiceEvents(score.parts[0]);
  assert.deepEqual(measures.map(m => m.supported), [false, false, false, true]);
  assert.ok(measures[0].issues.includes('chords'));
  assert.ok(measures[1].issues.includes('multiple_voices'));
  assert.ok(measures[2].issues.includes('double_accidental'));
  assert.deepEqual(practiceQueue(measures).map(e => e.step), ['D']);
  assert.deepEqual(supportSummary(measures), { measures: 4, supported: 1, skipped: 3, issues: { chords: 1, multiple_voices: 1, double_accidental: 1 } });
  const alto = readMusicXml(doc([n('C', 4)], { attributes: '<divisions>1</divisions><clef><sign>C</sign><line>3</line></clef>' }));
  assert.ok(practiceEvents(alto.parts[0])[0].issues.includes('unsupported_clef'));
});

test('a tied note is asked once and grace notes are skipped but named', () => {
  const tied = n('A', 4, { duration: 2, extra: '<tie type="start"/>' }) + n('A', 4, { duration: 2, extra: '<tie type="stop"/>' });
  const grace = '<note><grace/><pitch><step>B</step><octave>4</octave></pitch><voice>1</voice></note>' + n('C', 5);
  const measures = practiceEvents(readMusicXml(doc([tied, grace])).parts[0]);
  assert.deepEqual(practiceQueue(measures).map(e => e.step), ['A', 'C']);
  assert.ok(measures[1].supported);
  assert.ok(measures[1].issues.includes('grace_notes_skipped'));
});

test('a measure range limits the queue', () => {
  const measures = practiceEvents(readMusicXml(doc([n('C', 4), n('D', 4), n('E', 4), n('F', 4)])).parts[0]);
  assert.deepEqual(practiceQueue(measures, 1, 2).map(e => e.step), ['D', 'E']);
});

test('entities, internal subsets and malformed or foreign XML are rejected', () => {
  const code = fn => { try { fn(); return 'ok'; } catch (error) { assert.ok(error instanceof MusicXmlError); return error.code; } };
  assert.equal(code(() => parseXml('<!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>')), 'entities_not_allowed');
  assert.equal(code(() => parseXml('<!DOCTYPE x [<!ELEMENT x ANY>]><x/>')), 'internal_subset_not_allowed');
  assert.equal(code(() => parseXml('<x>&unknown;</x>')), 'unknown_entity');
  assert.equal(code(() => parseXml('<x><y></x>')), 'mismatched_tag');
  assert.equal(code(() => parseXml('<x>')), 'unclosed_tag');
  assert.equal(code(() => parseXml('<x/><y/>')), 'malformed');
  assert.equal(code(() => readMusicXml('<html><body/></html>')), 'not_musicxml');
  assert.equal(code(() => readMusicXml('<score-timewise/>')), 'timewise_not_supported');
  assert.equal(code(() => parseXml('<a>'.repeat(70) + '</a>'.repeat(70))), 'too_deep');
  assert.equal(code(() => parseXml('x'.repeat(MAX_FILE_BYTES + 1))), 'too_large');
  assert.equal(parseXml('<x a="1 &lt; 2"><![CDATA[<raw>]]><!-- c --></x>').attrs.a, '1 < 2');
});

test('file checks accept MusicXML names within the size limit only', () => {
  assert.doesNotThrow(() => checkFile('song.musicxml', 1000));
  assert.doesNotThrow(() => checkFile('Song.XML', 1000));
  for (const [name, size, expected] of [['song.mxl', 10, 'unsupported_extension'], ['song.pdf', 10, 'unsupported_extension'], ['a.xml', 0, 'empty_file'], ['a.xml', MAX_FILE_BYTES + 1, 'too_large']]) {
    assert.throws(() => checkFile(name, size), error => error.code === expected);
  }
});
