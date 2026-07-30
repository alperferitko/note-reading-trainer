export const AUDIO_PREFERENCE_KEYS = Object.freeze({
  music: "nota-nota-music-enabled",
  effects: "nota-nota-sound-enabled",
});

export const NOTANOTA_EFFECTS = Object.freeze([
  "session-start",
  "correct",
  "incorrect",
  "streak",
  "lesson-complete",
  "ui-click",
]);

const MUSIC_VOLUME = 0.15;
const EFFECT_VOLUME = 0.36;

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readAudioPreferences(storage = browserStorage()) {
  return {
    music: storage?.getItem(AUDIO_PREFERENCE_KEYS.music) !== "false",
    effects: storage?.getItem(AUDIO_PREFERENCE_KEYS.effects) !== "false",
  };
}

export function writeAudioPreference(kind, enabled, storage = browserStorage()) {
  storage?.setItem(AUDIO_PREFERENCE_KEYS[kind], String(enabled));
}

function browserEnvironment() {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  return {
    createAudio: () => new Audio(),
    document: window.document,
    requestFrame: window.requestAnimationFrame.bind(window),
    cancelFrame: window.cancelAnimationFrame.bind(window),
    resolveAsset: (file) => new URL(`./audio/${file}`, window.document.baseURI).toString(),
    now: () => performance.now(),
  };
}

export function createNotaNotaAudioController(overrides = {}) {
  const defaults = browserEnvironment();
  if (!defaults && !overrides.createAudio) return null;
  const environment = {
    ...defaults,
    ...overrides,
  };
  const fadeDuration = overrides.fadeDuration ?? 420;
  let unlocked = false;
  let musicWanted = false;
  let musicEnabled = true;
  let music = null;
  let fadeFrame = 0;
  let fadeSequence = 0;
  const activeEffects = new Map();

  function sourceFor(id, audio) {
    const supportsOpus = audio.canPlayType?.("audio/ogg; codecs=opus")?.replace("no", "");
    return environment.resolveAsset(`notanota-${id}.${supportsOpus ? "ogg" : "mp3"}`);
  }

  function safelyPlay(audio) {
    try {
      const result = audio.play();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
      // Audio is progressive enhancement. A decode/autoplay failure must not
      // interrupt practice.
    }
  }

  function fade(audio, target, onComplete) {
    fadeSequence += 1;
    const sequence = fadeSequence;
    if (fadeFrame) environment.cancelFrame(fadeFrame);
    const initial = Number(audio.volume) || 0;
    if (fadeDuration <= 0) {
      audio.volume = target;
      onComplete?.();
      return;
    }
    const startedAt = environment.now();
    const step = (timestamp) => {
      if (sequence !== fadeSequence) return;
      const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / fadeDuration));
      const eased = progress * progress * (3 - 2 * progress);
      audio.volume = initial + (target - initial) * eased;
      if (progress < 1) fadeFrame = environment.requestFrame(step);
      else {
        fadeFrame = 0;
        onComplete?.();
      }
    };
    fadeFrame = environment.requestFrame(step);
  }

  function ensureMusic() {
    if (music) return music;
    music = environment.createAudio();
    music.preload = "none";
    music.loop = true;
    music.volume = 0;
    music.src = sourceFor("ambient-loop", music);
    return music;
  }

  function shouldPlayMusic() {
    return unlocked && musicWanted && musicEnabled && !environment.document?.hidden;
  }

  function startMusic() {
    if (!shouldPlayMusic() || activeEffects.size > 0) return;
    const audio = ensureMusic();
    safelyPlay(audio);
    fade(audio, MUSIC_VOLUME);
  }

  function stopMusic(immediate = false) {
    if (!music) return;
    if (immediate || fadeDuration <= 0) {
      fadeSequence += 1;
      music.volume = 0;
      music.pause();
      return;
    }
    fade(music, 0, () => music?.pause());
  }

  function stopEffects() {
    for (const audio of activeEffects.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeEffects.clear();
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    startMusic();
  }

  function setAmbientMusic(active, enabled = musicEnabled) {
    musicWanted = Boolean(active);
    musicEnabled = Boolean(enabled);
    if (shouldPlayMusic()) startMusic();
    else stopMusic();
  }

  function playEffect(name, enabled = true) {
    if (!NOTANOTA_EFFECTS.includes(name) || !enabled || !unlocked || environment.document?.hidden) return false;
    stopEffects();
    const audio = environment.createAudio();
    audio.preload = "auto";
    audio.volume = EFFECT_VOLUME;
    audio.src = sourceFor(name, audio);
    audio.onended = () => {
      if (activeEffects.get(name) === audio) activeEffects.delete(name);
      startMusic();
    };
    activeEffects.set(name, audio);
    safelyPlay(audio);
    return true;
  }

  function stopAll() {
    musicWanted = false;
    stopMusic(true);
    stopEffects();
  }

  function handleVisibilityChange() {
    if (environment.document?.hidden) {
      stopMusic(true);
      stopEffects();
    } else {
      startMusic();
    }
  }

  environment.document?.addEventListener?.("visibilitychange", handleVisibilityChange);

  return {
    unlock,
    setAmbientMusic,
    playEffect,
    stopAll,
    getState: () => ({
      unlocked,
      musicWanted,
      musicEnabled,
      musicPlaying: Boolean(music && !music.paused),
      activeEffectCount: activeEffects.size,
    }),
    dispose: () => {
      stopAll();
      environment.document?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    },
  };
}

let browserController;

function controller() {
  browserController ??= createNotaNotaAudioController();
  return browserController;
}

export function unlockNotaNotaAudio() {
  controller()?.unlock();
}

export function setAmbientMusicActive(active, enabled) {
  controller()?.setAmbientMusic(active, enabled);
}

export function playNotaNotaEffect(name, enabled = true) {
  return controller()?.playEffect(name, enabled) ?? false;
}

export function stopAllNotaNotaAudio() {
  controller()?.stopAll();
}
