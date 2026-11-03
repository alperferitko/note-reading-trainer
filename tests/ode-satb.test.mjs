// The Ode to Joy setting shown in the AI workspace is checked note by note against the Mutopia
// LilyPond source (tests/fixtures/mutopia/ode-528.ly). The expected values come from that file,
// read here by its own small parser, never from the encoding under test or from a recognition run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ODE_VOICES, voiceBars, voiceMusicXml, satbMusicXml, closeScoreMusicXml, stepNote } from '../lib/samples/ode-satb.mjs';
import { readMusicXml, practiceEvents } from '../lib/musicxml.mjs';

const ly = await readFile(new URL('./fixtures/mutopia/ode-528.ly', import.meta.url), 'utf8');

/** Notes of one LilyPond voice (absolute mode, optional \transpose c c'), as step/alter/octave/beats. */
function lilyVoice(name) {
  const start = ly.indexOf(`${name} =`);
  const open = ly.indexOf('{', start);
  let depth = 0, end = open;
  for (; end < ly.length; end++) { if (ly[end] === '{') depth++; if (ly[end] === '}' && --depth === 0) break; }
  const head = ly.slice(start, open);
  const shift = /\\transpose c c'/.test(head) ? 1 : 0;
  const body = ly.slice(open + 1, end).replace(/\\[a-zA-Z]+(\s+"[^"]*")?/g, ' ');
  const out = []; let beats = 1;
  for (const m of body.matchAll(/(?<![a-z])([a-g])(is|es)?([',]*)(\d+)?(\.)?/g)) {
    const [, letter, acc, marks, dur, dot] = m;
    if (dur) beats = (4 / Number(dur)) * (dot ? 1.5 : 1);
    const octave = 3 + shift + (marks.match(/'/g)?.length ?? 0) - (marks.match(/,/g)?.length ?? 0);
    out.push({ step: letter.toUpperCase(), alter: acc === 'is' ? 1 : acc === 'es' ? -1 : 0, octave, beats });
  }
  return out;
}

const LY_NAME = { soprano: 'sop', alto: 'alto', tenor: 'tenor', bass: 'bass' };

test('every voice matches the LilyPond source note for note', () => {
  let compared = 0;
  for (const voice of ODE_VOICES) {
    const expected = lilyVoice(LY_NAME[voice.id]);
    const actual = voiceBars(voice.id).flat().map(({ step, alter, octave, beats }) => ({ step, alter, octave, beats }));
    assert.equal(actual.length, expected.length, `${voice.id}: note count`);
    actual.forEach((note, i) => assert.deepEqual(note, expected[i], `${voice.id} note ${i + 1}`));
    compared += actual.length;
  }
  assert.ok(compared > 200, `compared ${compared} notes`);
});

test('16 bars of four beats in every voice', () => {
  for (const voice of ODE_VOICES) {
    const bars = voiceBars(voice.id);
    assert.equal(bars.length, 16, voice.id);
    bars.forEach((bar, i) => assert.equal(bar.reduce((s, n) => s + n.beats, 0), 4, `${voice.id} bar ${i + 1}`));
  }
});

test('the product reader accepts each voice in full and keeps the accidentals', () => {
  for (const voice of ODE_VOICES) {
    const score = readMusicXml(voiceMusicXml(voice.id));
    const measures = practiceEvents(score.parts[0], 1);
    assert.equal(measures.length, 16, voice.id);
    assert.equal(measures.filter((m) => m.issues?.length).length, 0, `${voice.id} unsupported bars`);
  }
  const alto = practiceEvents(readMusicXml(voiceMusicXml('alto')).parts[0], 1);
  const bar12 = JSON.stringify(alto[11]);
  assert.match(bar12, /"step":"C"/);
  assert.match(bar12, /"alter":1/); // C sharp in bar 12
  assert.equal(readMusicXml(satbMusicXml()).parts.length, 4);
});

test('a correction moves a note by step and follows the key', () => {
  const [first] = voiceBars('soprano')[0];
  assert.deepEqual(stepNote(first, 1), { ...first, step: 'C', octave: 5, alter: 0 });
  assert.deepEqual(stepNote({ ...first, step: 'G' }, -1), { ...first, step: 'F', alter: 1 });
  const corrected = voiceBars('soprano', { '0:0': { step: 'A' } })[0][0];
  assert.equal(corrected.step, 'A');
});

test('the landing comparison (bars 1-4 on two staves) carries the LilyPond notes of all four voices', () => {
  const xml = closeScoreMusicXml({ from: 1, to: 4 });
  const notes = [...xml.matchAll(/<note><pitch><step>([A-G])<\/step>(?:<alter>(-?\d)<\/alter>)?<octave>(\d)<\/octave><\/pitch><duration>(\d+)<\/duration><voice>(\d)<\/voice>.*?<staff>(\d)<\/staff><\/note>/g)]
    .map(([, step, alter, octave, duration, voice, staff]) => ({ step, alter: Number(alter ?? 0), octave: Number(octave), beats: Number(duration) / 2, voice: Number(voice), staff: Number(staff) }));
  ODE_VOICES.forEach((voice, v) => {
    const mine = notes.filter((n) => n.voice === v + 1);
    const expected = lilyVoice(LY_NAME[voice.id]);
    let beats = 0, i = 0;
    while (beats < 16) beats += expected[i++].beats;
    assert.equal(mine.length, i, `${voice.id}: notes in bars 1-4`);
    mine.forEach((n, k) => assert.deepEqual({ step: n.step, alter: n.alter, octave: n.octave, beats: n.beats }, expected[k], `${voice.id} note ${k + 1}`));
    assert.ok(mine.every((n) => n.staff === (v < 2 ? 1 : 2)), `${voice.id} staff`);
  });
  assert.equal((xml.match(/<measure /g) ?? []).length, 4);
});
