import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uygulama çalışma sesini doğru cevaplarda ve kullanıcının açtığı ritim araçlarında çalar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const guitar = await readFile(new URL("../app/guitar-trainer.tsx", import.meta.url), "utf8");
  const scoreReading = await readFile(new URL("../app/score-reading-trainer.tsx", import.meta.url), "utf8");
  const practiceAudio = await readFile(new URL("../lib/practice-audio.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /if \(correct\) \{[\s\S]*playPracticeNote\(noteIdToMidi\(current\.id\), noteSoundEnabled\);/);
  assert.match(guitar, /function finishCorrectAnswer\(question: GuitarQuestion\) \{[\s\S]*playPracticeNote\(question\.midi, noteSoundEnabled\);/);
  assert.match(guitar, /if \(guessed\.letter === current\.letter\) \{\s*finishCorrectAnswer\(current\);/);
  assert.match(guitar, /if \(requiredPositions\.every\(\(item\) => selectedCorrectIds\.has\(item\.id\)\)\) \{[\s\S]*finishCorrectAnswer\(current\);/);
  assert.equal((page.match(/playPracticeNote\(/g) ?? []).length, 1);
  assert.equal((guitar.match(/playPracticeNote\(/g) ?? []).length, 1);
  assert.match(scoreReading, /function toggleRhythmDemo\(id: RhythmId\)[\s\S]*if \(shouldPlay\)[\s\S]*playRhythmPulse/);
  assert.match(scoreReading, /onClick=\{\(\) => toggleRhythmDemo\(id\)\}/);
  assert.match(scoreReading, /aria-pressed=\{playing\}/);
  assert.match(practiceAudio, /export function playRhythmPulse/);
  assert.match(practiceAudio, /export function playMetronomeClick/);
  assert.match(practiceAudio, /oscillator\.type = "square"/);
  assert.match(scoreReading, /if \(nextEnabled\) playMetronomeClick\(\)/);
  assert.match(page, /role="switch" aria-checked=\{noteSoundEnabled\}/);
  assert.match(page, /createPortal\([\s\S]*audio-settings-panel[\s\S]*document\.body/);
  assert.match(page, /!audioSettingsPanelRef\.current\?\.contains\(event\.target\)/);
  assert.match(styles, /\.audio-settings-panel \{[\s\S]*position: fixed;[\s\S]*z-index: 120;/);
  assert.match(page, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(page, /!audioSettingsRef\.current\?\.contains\(event\.target\)/);
  assert.doesNotMatch(
    `${page}\n${guitar}\n${scoreReading}\n${practiceAudio}`,
    /playNotaNotaEffect|setAmbientMusicActive|unlockNotaNotaAudio|listen-note-button|musicEnabled|autoplay|autoPlay|\.mp3|\.ogg/,
  );
});
