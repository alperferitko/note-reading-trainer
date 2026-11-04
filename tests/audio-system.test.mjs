import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uygulama çalışma sesini doğru cevaplarda ve kullanıcının açtığı ritim araçlarında çalar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const guitar = await readFile(new URL("../app/guitar-trainer.tsx", import.meta.url), "utf8");
  const scoreReading = await readFile(new URL("../app/score-reading-trainer.tsx", import.meta.url), "utf8");
  const practiceAudio = await readFile(new URL("../lib/practice-audio.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /if \(correct\) \{[\s\S]*playPracticeNote\(current\.midi \?\? noteIdToMidi\(current\.id\), noteSoundEnabled\);/);
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
  assert.match(scoreReading, /if \(nextEnabled && stage !== "playing"\) playMetronomeClick\(\)/);
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

test("doğru cevap sesi varsayılan olarak piyano örnekleriyle çalar ve yalnız audio/piano/ dosyalarını kullanır", async () => {
  const voices = await readFile(new URL("../lib/note-voices.ts", import.meta.url), "utf8");
  const practiceAudio = await readFile(new URL("../lib/practice-audio.ts", import.meta.url), "utf8");
  const legal = await readFile(new URL("../app/legal-pages.tsx", import.meta.url), "utf8");

  assert.match(voices, /export const DEFAULT_NOTE_VOICE: NoteVoice = "piano";/);
  assert.match(voices, /const NOTE_VOICE_KEY = "notanota-note-voice-v1";/);
  assert.match(voices, /export type NoteVoice = "piano" \| "soft" \| "marimba" \| "bell";/);
  assert.match(voices, /new URL\(`audio\/piano\/\$\{name\}\.mp3`, document\.baseURI\)/);
  const audioPaths = voices.match(/audio\/[\w-]+\//g) ?? [];
  assert.ok(audioPaths.length > 0);
  assert.ok(audioPaths.every((path) => path === "audio/piano/"), audioPaths.join(", "));
  assert.doesNotMatch(voices, /https?:\/\/(?!creativecommons)|autoplay|autoPlay|\.ogg|\.wav/);
  // A missing sample never silences the note: the soft synth plays while loading continues.
  assert.match(voices, /if \(!playPianoSample\(audio, midi\)\) playSoft\(audio, midi\);/);

  assert.match(practiceAudio, /export function playPracticeNote\(midi: number, enabled = true, voice\?: NoteVoice\)/);
  assert.match(practiceAudio, /voice \?\? readNoteVoice\(\)/);
  assert.match(practiceAudio, /export function previewNoteVoice\(voice: NoteVoice\) \{\s*playPracticeNote\(60, true, voice\);/);
  assert.match(practiceAudio, /const NOTE_SOUND_PREFERENCE_KEY = "nota-nota-correct-note-sound";/);


  // Passages (the landing comparison) schedule polyphonic notes in the same voice.
  const music = await readFile(new URL("../app/landing/music.tsx", import.meta.url), "utf8");
  assert.match(voices, /export function scheduleVoiceNote\(audio: AudioContext, midi: number, at: number, seconds: number, voice: NoteVoice, gain = PIANO_GAIN\): \(\) => void/);
  assert.match(voices, /export function ensurePianoLoaded\(audio: BaseAudioContext, midis: readonly number\[\]\): Promise<void>/);
  assert.match(voices, /const SCHEDULED_RELEASE = 0\.25;/);
  assert.match(voices, /export const CHORD_NOTE_GAIN = 0\.35;/);
  const scheduled = voices.slice(voices.indexOf("export function scheduleVoiceNote"));
  assert.doesNotMatch(scheduled, /lastPianoNote/);
  assert.match(music, /const chosen = readNoteVoice\(\);/);
  assert.match(music, /Promise\.race\(\[ensurePianoLoaded\(ctx, midis\), timeout\]\)/);
  assert.match(music, /scheduleVoiceNote\(ctx, note\.midi, t0 \+ note\.start \* beat, note\.beats \* beat, playing, gain\)/);
  assert.match(music, /for \(const silence of silencers\) silence\(\);/);
  assert.doesNotMatch(music, /new Ctor\(|new AudioContext/);

  assert.match(legal, /Salamander Grand Piano[\s\S]*Alexander Holm[\s\S]*CC BY 3\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/3\.0\/\)/);
});
