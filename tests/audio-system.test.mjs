import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  AUDIO_PREFERENCE_KEYS,
  createNotaNotaAudioController,
  readAudioPreferences,
  writeAudioPreference,
} from "../lib/notanota-audio.mjs";

function fakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function fakeDocument() {
  const listeners = new Map();
  return {
    hidden: false,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
    dispatch: (name) => listeners.get(name)?.(),
  };
}

function fakeAudioFactory(created) {
  return () => {
    const audio = {
      src: "",
      preload: "",
      loop: false,
      paused: true,
      volume: 0,
      currentTime: 0,
      playCalls: 0,
      pauseCalls: 0,
      canPlayType: (type) => type.includes("opus") ? "probably" : "",
      play() {
        this.paused = false;
        this.playCalls += 1;
        return Promise.resolve();
      },
      pause() {
        this.paused = true;
        this.pauseCalls += 1;
      },
    };
    created.push(audio);
    return audio;
  };
}

test("müzik ve efekt tercihleri ayrı anahtarlarda kalıcıdır", () => {
  const storage = fakeStorage();
  assert.deepEqual(readAudioPreferences(storage), { music: true, effects: true });
  writeAudioPreference("music", false, storage);
  writeAudioPreference("effects", false, storage);
  assert.deepEqual(readAudioPreferences(storage), { music: false, effects: false });
  assert.notEqual(AUDIO_PREFERENCE_KEYS.music, AUDIO_PREFERENCE_KEYS.effects);
});

test("arka plan müziği etkileşimden önce başlamaz ve çalışma ekranında durur", () => {
  const created = [];
  const document = fakeDocument();
  const controller = createNotaNotaAudioController({
    createAudio: fakeAudioFactory(created),
    document,
    requestFrame: (callback) => {
      callback(1000);
      return 1;
    },
    cancelFrame() {},
    resolveAsset: (file) => `/audio/${file}`,
    now: () => 0,
    fadeDuration: 0,
  });

  controller.setAmbientMusic(true, true);
  assert.equal(created.length, 0);
  assert.equal(controller.getState().musicPlaying, false);

  controller.unlock();
  assert.equal(created.length, 1);
  assert.equal(created[0].loop, true);
  assert.equal(created[0].volume, 0.15);
  assert.equal(created[0].paused, false);
  assert.match(created[0].src, /notanota-ambient-loop\.ogg$/);

  controller.setAmbientMusic(false, true);
  assert.equal(created[0].paused, true);
  assert.equal(controller.getState().musicPlaying, false);
  controller.dispose();
});

test("efektler üst üste binmez ve sekme gizlenince bütün sesler durur", () => {
  const created = [];
  const document = fakeDocument();
  const controller = createNotaNotaAudioController({
    createAudio: fakeAudioFactory(created),
    document,
    requestFrame: (callback) => {
      callback(1000);
      return 1;
    },
    cancelFrame() {},
    resolveAsset: (file) => `/audio/${file}`,
    now: () => 0,
    fadeDuration: 0,
  });

  controller.setAmbientMusic(true, true);
  controller.unlock();
  assert.equal(controller.playEffect("correct", true), true);
  const firstEffect = created[1];
  assert.equal(controller.playEffect("correct", true), true);
  const secondEffect = created[2];
  assert.equal(firstEffect.paused, true);
  assert.equal(firstEffect.currentTime, 0);
  assert.equal(secondEffect.paused, false);
  assert.equal(controller.getState().activeEffectCount, 1);

  document.hidden = true;
  document.dispatch("visibilitychange");
  assert.equal(created[0].paused, true);
  assert.equal(secondEffect.paused, true);
  assert.equal(controller.getState().activeEffectCount, 0);
  controller.dispose();
});

test("üretilen set süre, format, loudness, peak ve boyut sınırlarını karşılar", async () => {
  const report = JSON.parse(await readFile(
    new URL("../audio-src/notanota/audio-report.json", import.meta.url),
    "utf8",
  ));
  const expectedDurations = new Map([
    ["notanota-ambient-loop", 30],
    ["notanota-session-start", 2.2],
    ["notanota-correct", 0.55],
    ["notanota-incorrect", 0.7],
    ["notanota-streak", 1.3],
    ["notanota-lesson-complete", 2.8],
    ["notanota-ui-click", 0.12],
  ]);

  assert.equal(report.sampleRate, 48_000);
  assert.equal(report.bitDepth, 24);
  assert.equal(report.pieces.length, 7);
  let webBytes = 0;
  for (const piece of report.pieces) {
    assert.equal(piece.durationSeconds, expectedDurations.get(piece.id));
    assert.equal(piece.sampleRate, 48_000);
    assert.equal(piece.bitDepth, 24);
    assert.ok(piece.truePeakDbtp <= (piece.loop ? -3 : -5));
    if (piece.loop) {
      assert.ok(Math.abs(piece.integratedLufs - (-23)) <= 0.25);
      assert.ok(piece.boundaryDeltaDbfs <= -60);
    }
    for (const format of ["wav", "ogg", "mp3"]) {
      await access(new URL(`../${piece.files[format].path}`, import.meta.url));
    }
    webBytes += piece.files.ogg.bytes + piece.files.mp3.bytes;
  }
  assert.ok(webBytes < 2_000_000);

  const loopWav = await readFile(new URL("../audio-src/notanota/masters/notanota-ambient-loop.wav", import.meta.url));
  const loopMusicXml = await readFile(new URL("../audio-src/notanota/scores/notanota-ambient-loop.musicxml", import.meta.url), "utf8");
  assert.equal(loopWav.subarray(0, 4).toString(), "RIFF");
  assert.equal(loopWav.readUInt32LE(24), 48_000);
  assert.equal(loopWav.readUInt16LE(34), 24);
  assert.equal([...loopMusicXml.matchAll(/<measure /g)].length, 8);
  assert.match(loopMusicXml, /<per-minute>64<\/per-minute>/);

  const ogg = await readFile(new URL("../public/audio/notanota-ambient-loop.ogg", import.meta.url));
  const mp3 = await readFile(new URL("../public/audio/notanota-ambient-loop.mp3", import.meta.url));
  assert.equal(ogg.subarray(0, 4).toString(), "OggS");
  assert.ok(mp3.subarray(0, 3).toString() === "ID3" || mp3[0] === 0xff);
  assert.equal((await stat(new URL("../public/audio/notanota-ambient-loop.ogg", import.meta.url))).size, report.pieces[0].files.ogg.bytes);
});

test("entegrasyon menülerde müzik, çalışmada sessizlik ve tekil efekt sözleşmesini kullanır", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const guitar = await readFile(new URL("../app/guitar-trainer.tsx", import.meta.url), "utf8");
  const audio = await readFile(new URL("../lib/notanota-audio.mjs", import.meta.url), "utf8");

  assert.match(page, /setAmbientMusicActive\(audioPreferencesReady && stage !== "quiz" && stage !== "guitar", musicEnabled\)/);
  assert.match(page, /window\.addEventListener\("pointerdown", unlock, \{ once: true \}\)/);
  assert.match(page, /setAmbientMusicActive\(false, musicEnabled\);[\s\S]*playNotaNotaEffect\("session-start", soundEnabled\)/);
  assert.match(page, /playNotaNotaEffect\("session-start", soundEnabled\)/);
  assert.match(page, /completesSession \? "lesson-complete" : nextStreak % 5 === 0 \? "streak" : "correct"/);
  assert.match(page, /playNotaNotaEffect\("incorrect", soundEnabled\)/);
  assert.match(page, /role="switch" aria-checked=\{musicEnabled\}/);
  assert.match(page, /role="switch" aria-checked=\{soundEnabled\}/);
  assert.match(guitar, /playNotaNotaEffect\("session-start", soundEnabled\)/);
  assert.match(audio, /stopEffects\(\);[\s\S]*const audio = environment\.createAudio\(\)/);
  assert.match(audio, /if \(environment\.document\?\.hidden\) \{[\s\S]*stopMusic\(true\);[\s\S]*stopEffects\(\)/);
  assert.doesNotMatch(page, /autoplay|autoPlay/);
});
