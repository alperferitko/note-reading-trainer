import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PALETTES, DEFAULT_PALETTE, contrast, readPalette, writePalette, PALETTE_BOOT_SCRIPT } from '../lib/palettes.mjs';
import { expectedOutputs, remapColour, LOGO_BASE } from '../scripts/build-palettes.mjs';
import { DEMO_PIECE, layout, measureCount, midiOf, schedule, staffPosition, toMusicXml, totalBeats } from '../lib/demo-piece.mjs';
import { readMusicXml, practiceEvents } from '../lib/musicxml.mjs';
import { createDemoTeacher, matchTopic, TOPIC_IDS } from '../lib/teacher-demo.mjs';
import { addToPlan, readPlan, removeFromPlan, PLAN_LIMIT } from '../lib/study-plan.mjs';
import { CLEF_PATH, CLEF_SPACE } from '../lib/clef-path.mjs';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test('every palette keeps normal text, muted text and buttons at 4.5:1 or better, light and dark', () => {
  assert.equal(PALETTES.length, 5);
  assert.ok(PALETTES.every((p) => p.emblem), "every palette has an emblem");
  for (const palette of PALETTES) for (const mode of ['light', 'dark']) {
    const t = palette[mode];
    for (const [name, a, b] of [['text', t.foreground, t.background], ['text on surface', t.foreground, t.surface], ['muted', t.muted, t.background],
      ['muted on deep', t.muted, t.deep], ['button', t.onPrimary, t.primary], ['link', t.primary, t.background], ['link on surface', t.primary, t.surface], ['link on soft', t.primary, t.soft]]) {
      assert.ok(contrast(a, b) >= 4.5, `${palette.id} ${mode} ${name}: ${contrast(a, b).toFixed(2)}`);
    }
  }
});

test('the generated stylesheet and logo files are current and the original logo is untouched', async () => {
  const files = await expectedOutputs(new URL('../', import.meta.url));
  for (const [path, content] of Object.entries(files)) assert.equal(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), content, `${path} is stale: run node scripts/build-palettes.mjs`);
  const original = await readFile(new URL('../public/brand/notanota-original.svg', import.meta.url), 'utf8');
  assert.equal(files['public/brand/notanota-bordo.svg'], original, 'the default palette uses the original logo file');
  // Variants change colours only: same number of paths, same geometry.
  const geometry = (svg) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join('|');
  for (const palette of PALETTES) {
    const svg = files[`public/brand/notanota-${palette.id}-dark.svg`];
    assert.equal(geometry(svg), geometry(original));
    assert.equal((svg.match(/fill-opacity="[^"]+"/g) ?? []).join(), (original.match(/fill-opacity="[^"]+"/g) ?? []).join());
  }
  assert.equal(remapColour(LOGO_BASE, PALETTES[1].light.primary), PALETTES[1].light.primary);
});

test('palette preference falls back to the default and the boot script only sets known ids', () => {
  const storage = memoryStorage();
  assert.equal(readPalette(storage), DEFAULT_PALETTE);
  assert.equal(writePalette('indigo', storage), 'indigo');
  assert.equal(readPalette(storage), 'indigo');
  assert.equal(writePalette('<script>', storage), DEFAULT_PALETTE);
  assert.match(PALETTE_BOOT_SCRIPT, /"bordo","petrol","indigo","kiremit","meta"/);
  assert.match(PALETTE_BOOT_SCRIPT, /prefers-color-scheme: dark/);
});

test('the demo piece fills whole 4/4 bars with real notation, and every view comes from the same events', () => {
  assert.equal(totalBeats() % DEMO_PIECE.beatsPerMeasure, 0);
  assert.equal(measureCount(), 3);
  const placed = layout();
  for (const bar of [1, 2, 3]) assert.equal(placed.filter((e) => e.measure === bar).reduce((s, e) => s + e.beats, 0), 4);
  // A sharp, a flat, two rests, eighth notes and a dotted half are all present.
  assert.ok(placed.some((e) => e.alter === 1) && placed.some((e) => e.alter === -1));
  assert.equal(placed.filter((e) => e.rest).length, 2);
  assert.ok(placed.some((e) => e.beats === 0.5) && placed.some((e) => e.dots === 1 && e.beats === 3));
  assert.ok(placed.every((e, i) => i === 0 || e.x > placed[i - 1].x));
  assert.equal(staffPosition({ step: 'G', octave: 4 }), 2);
  assert.equal(midiOf({ step: 'F', octave: 4, alter: 1 }), 66);
  assert.equal(midiOf({ step: 'B', octave: 4, alter: -1 }), 70);
  assert.deepEqual(schedule().map((e) => e.start), [0, 1, 1.5, 2, 3, 4, 5, 5.5, 6, 8, 11]);
  // The MusicXML handed to the score workspace parses back to the same pitches, accidentals, lengths and rests.
  const score = readMusicXml(toMusicXml());
  const events = practiceEvents(score.parts[0], 1).flatMap((m) => m.events);
  const key = (e) => e.kind === 'rest' || e.rest ? `r${e.beats}` : `${e.step}${e.alter ? (e.alter > 0 ? '#' : 'b') : ''}${e.octave}:${e.beats}`;
  assert.deepEqual(events.map(key), DEMO_PIECE.notes.map(key));
});

test('the sample teacher answers its three topics and says plainly when a question is outside them', () => {
  const teacher = createDemoTeacher();
  assert.equal(teacher.mode, 'demo');
  assert.equal(teacher.topics('tr').length, TOPIC_IDS.length);
  const solLa = teacher.ask({ topicId: 'sol-la', locale: 'tr' });
  assert.match(solLa.teacher[0], /alttan ikinci çizgide/);
  assert.deepEqual(solLa.actions[0].payload.notes, ['g4', 'a4']);
  assert.equal(solLa.actions[0].payload.notes.length * solLa.actions[0].payload.repeats, 8);
  assert.equal(matchTopic('Sol ile La’yı karıştırıyorum'), 'sol-la');
  assert.equal(matchTopic('Ek çizgili notalar zor'), 'ledger');
  assert.equal(matchTopic('Hangi ölçüde zorlandım?'), 'slow-measure');
  for (const question of ['Do ile re’yi karıştırıyorum', 'Bana bir şarkı yaz', 'Gitar akordu nasıl yapılır?', '']) {
    const reply = teacher.ask({ text: question, locale: 'tr' });
    assert.equal(reply.kind, 'out-of-scope', question);
    assert.equal(reply.actions.length, 0);
  }
  // The measure scenario is built on sample data that says so, and never reports rhythm values.
  const measure = teacher.ask({ topicId: 'slow-measure', locale: 'tr' });
  assert.match(measure.sample.title, /Örnek/);
  assert.ok(measure.sample.rows.some((row) => /Ritim ve tempo ölçülmedi/.test(row)));
  assert.ok(!measure.teacher.join(' ').match(/\d+\s*(ms|BPM)/));
});

test('the study plan is kept per account, deduplicated, bounded and newest first', () => {
  const storage = memoryStorage();
  addToPlan('user-a', { id: 'sol-la', title: 'A' }, { storage, now: new Date('2026-11-02T10:00:00Z') });
  addToPlan('user-a', { id: 'sol-la', title: 'A again' }, { storage });
  addToPlan('user-a', { id: 'ledger', title: 'B' }, { storage, now: new Date('2026-11-02T11:00:00Z') });
  assert.deepEqual(readPlan('user-a', storage).map((i) => i.id), ['ledger', 'sol-la']);
  assert.deepEqual(readPlan('user-b', storage), []);
  assert.deepEqual(removeFromPlan('user-a', 'ledger', storage).map((i) => i.id), ['sol-la']);
  for (let i = 0; i < 20; i++) addToPlan(null, { id: `x${i}`, title: 'x' }, { storage });
  assert.equal(readPlan(null, storage).length, PLAN_LIMIT);
  storage.setItem('notanota-study-plan-v1:guest', '{bad json');
  assert.deepEqual(readPlan(null, storage), []);
});

test('the clef outline is one SVG path with its origin on the G line', () => {
  assert.match(CLEF_PATH, /^M[-\d. ]+/);
  const ys = [...CLEF_PATH.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
  // About 4.5 spaces above the G line and 2.6 below, like an engraved treble clef.
  assert.ok(Math.min(...ys) / CLEF_SPACE < -4.2 && Math.min(...ys) / CLEF_SPACE > -4.8);
  assert.ok(Math.max(...ys) / CLEF_SPACE > 2.4 && Math.max(...ys) / CLEF_SPACE < 2.9);
});

test('the GitHub Pages entry loads the same stylesheets as the app layout and boots the saved theme', async () => {
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const main = await readFile(new URL('../github-pages/main.tsx', import.meta.url), 'utf8');
  const html = await readFile(new URL('../github-pages/index.html', import.meta.url), 'utf8');
  const sheets = (source) => [...source.matchAll(/import "\.{1,2}\/(?:app\/)?([\w-]+\.css)";/g)].map((m) => m[1]);
  assert.deepEqual(sheets(main), sheets(layout));
  assert.ok(html.includes(`<script>${PALETTE_BOOT_SCRIPT}</script>`), 'index.html carries the same boot script');
});
