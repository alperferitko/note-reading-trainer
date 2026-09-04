let audioContext: AudioContext | null = null;
const NOTE_SOUND_PREFERENCE_KEY = "nota-nota-correct-note-sound";

function context() {
  if (typeof window === "undefined") return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

export function readNoteSoundPreference() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(NOTE_SOUND_PREFERENCE_KEY) !== "off";
}

export function writeNoteSoundPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTE_SOUND_PREFERENCE_KEY, enabled ? "on" : "off");
}

export function noteIdToMidi(noteId: string) {
  const match = /^([a-g])([0-8])$/i.exec(noteId);
  if (!match) return 60;
  const pitchClasses: Record<string, number> = {
    c: 0,
    d: 2,
    e: 4,
    f: 5,
    g: 7,
    a: 9,
    b: 11,
  };
  return (Number(match[2]) + 1) * 12 + pitchClasses[match[1].toLowerCase()];
}

export function playPracticeNote(midi: number, enabled = true) {
  if (!enabled) return;
  const audio = context();
  if (!audio) return;

  const now = audio.currentTime;
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const master = audio.createGain();
  const body = audio.createOscillator();
  const warmth = audio.createOscillator();
  const warmthGain = audio.createGain();

  body.type = "sine";
  body.frequency.setValueAtTime(frequency, now);
  warmth.type = "triangle";
  warmth.frequency.setValueAtTime(frequency * 2, now);
  warmthGain.gain.setValueAtTime(0.09, now);

  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.32, now + 0.018);
  master.gain.exponentialRampToValueAtTime(0.13, now + 0.22);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);

  body.connect(master);
  warmth.connect(warmthGain);
  warmthGain.connect(master);
  master.connect(audio.destination);

  body.start(now);
  warmth.start(now);
  body.stop(now + 1.08);
  warmth.stop(now + 1.08);
}

export function playRhythmPulse(midi: number, enabled = true, durationMs = 150) {
  if (!enabled) return;
  const audio = context();
  if (!audio) return;

  const now = audio.currentTime;
  const duration = Math.max(0.08, Math.min(0.24, durationMs / 1000));
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function playMetronomeClick() {
  const audio = context();
  if (!audio) return;

  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(1320, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.085, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.04);
}
