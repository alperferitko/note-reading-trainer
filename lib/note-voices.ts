/**
 * Voices for the single note played after a correct answer, and for scheduled passages.
 *
 * "piano" uses the Salamander Grand Piano samples (Alexander Holm, CC BY 3.0),
 * self-hosted under public/audio/piano/ (one sample every minor third, A1–C7).
 * The other voices are small Web Audio synths. Nothing here plays on its own;
 * a note sounds only when the caller asks for one.
 */

export type NoteVoice = "piano" | "soft" | "marimba" | "bell";

export const NOTE_VOICES: ReadonlyArray<{ id: NoteVoice; label: { tr: string; en: string } }> = [
  { id: "piano", label: { tr: "Piyano", en: "Piano" } },
  { id: "soft", label: { tr: "Yumuşak", en: "Soft" } },
  { id: "marimba", label: { tr: "Marimba", en: "Marimba" } },
  { id: "bell", label: { tr: "Çan", en: "Bell" } },
];

export const DEFAULT_NOTE_VOICE: NoteVoice = "piano";
const NOTE_VOICE_KEY = "notanota-note-voice-v1";

function isNoteVoice(value: unknown): value is NoteVoice {
  return NOTE_VOICES.some((voice) => voice.id === value);
}

export function readNoteVoice(): NoteVoice {
  if (typeof window === "undefined") return DEFAULT_NOTE_VOICE;
  try {
    const saved = window.localStorage.getItem(NOTE_VOICE_KEY);
    return isNoteVoice(saved) ? saved : DEFAULT_NOTE_VOICE;
  } catch {
    return DEFAULT_NOTE_VOICE;
  }
}

export function writeNoteVoice(voice: NoteVoice) {
  if (typeof window === "undefined" || !isNoteVoice(voice)) return;
  try {
    window.localStorage.setItem(NOTE_VOICE_KEY, voice);
  } catch {
    /* Storage can be unavailable (private mode); the default stays. */
  }
}

function frequencyOf(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/* ---------- Piano samples ---------- */

const PIANO_LOW = 33; // A1
const PIANO_HIGH = 96; // C7
const PIANO_STEP = 3; // one sample every minor third
const PIANO_NAMES: Record<number, string> = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" };
const PIANO_GAIN = 0.7;
const PIANO_HOLD = 1.6; // seconds before the release starts
const PIANO_RELEASE = 0.35;
const DAMP_TIME = 0.08; // fade of the previous note when a new one starts
const SCHEDULED_RELEASE = 0.25; // a scheduled note fades out over this after its written length
const STOP_FADE = 0.03; // stop(): fade to silence this fast instead of clicking

/** Peak level of one piano note when several sound together (four voices of a chord). */
export const CHORD_NOTE_GAIN = 0.35;

type PianoState = { buffers: Map<number, AudioBuffer>; pending: Map<number, Promise<void>>; warmed: boolean };
const pianoStates = new WeakMap<BaseAudioContext, PianoState>();
let lastPianoNote: { gain: GainNode; source: AudioBufferSourceNode } | null = null;

function pianoState(audio: BaseAudioContext) {
  let state = pianoStates.get(audio);
  if (!state) {
    state = { buffers: new Map(), pending: new Map(), warmed: false };
    pianoStates.set(audio, state);
  }
  return state;
}

function nearestPianoSample(midi: number) {
  const clamped = Math.min(PIANO_HIGH, Math.max(PIANO_LOW, Math.round(midi)));
  return PIANO_LOW + Math.round((clamped - PIANO_LOW) / PIANO_STEP) * PIANO_STEP;
}

function pianoSampleUrl(sampleMidi: number) {
  const name = `${PIANO_NAMES[sampleMidi % 12]}${Math.floor(sampleMidi / 12) - 1}`;
  return new URL(`audio/piano/${name}.mp3`, document.baseURI).href;
}

function loadPianoSample(audio: BaseAudioContext, sampleMidi: number): Promise<void> {
  const state = pianoState(audio);
  if (state.buffers.has(sampleMidi)) return Promise.resolve();
  const existing = state.pending.get(sampleMidi);
  if (existing) return existing;
  const request = fetch(pianoSampleUrl(sampleMidi))
    .then((response) => {
      if (!response.ok) throw new Error(`piano sample ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => audio.decodeAudioData(bytes))
    .then((buffer) => {
      state.buffers.set(sampleMidi, buffer);
    })
    .catch(() => {
      /* Leave it unloaded; the soft synth covers it and a later note retries. */
    })
    .finally(() => {
      state.pending.delete(sampleMidi);
    });
  state.pending.set(sampleMidi, request);
  return request;
}

/** Loads the sample nearest to `midi` first, then the rest of the set one by one. */
function warmPiano(audio: BaseAudioContext, midi: number) {
  const state = pianoState(audio);
  const first = loadPianoSample(audio, nearestPianoSample(midi));
  if (state.warmed) return;
  state.warmed = true;
  void first.then(async () => {
    for (let sample = PIANO_LOW; sample <= PIANO_HIGH; sample += PIANO_STEP) {
      await loadPianoSample(audio, sample);
    }
  });
}

/** Starts loading the piano samples without playing anything. */
export function preloadNoteVoice(audio: BaseAudioContext, voice: NoteVoice, midi = 60) {
  if (voice === "piano") warmPiano(audio, midi);
}

function playPianoSample(audio: AudioContext, midi: number) {
  const sampleMidi = nearestPianoSample(midi);
  const buffer = pianoState(audio).buffers.get(sampleMidi);
  if (!buffer) return false;

  const now = audio.currentTime;
  if (lastPianoNote) {
    const previous = lastPianoNote;
    try {
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setValueAtTime(previous.gain.gain.value, now);
      previous.gain.gain.linearRampToValueAtTime(0, now + DAMP_TIME);
      previous.source.stop(now + DAMP_TIME + 0.02);
    } catch {
      /* The previous note already ended. */
    }
  }

  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(2 ** ((midi - sampleMidi) / 12), now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(PIANO_GAIN, now + 0.004);
  gain.gain.setValueAtTime(PIANO_GAIN, now + PIANO_HOLD);
  gain.gain.linearRampToValueAtTime(0, now + PIANO_HOLD + PIANO_RELEASE);
  source.connect(gain);
  gain.connect(audio.destination);
  source.start(now);
  source.stop(now + PIANO_HOLD + PIANO_RELEASE + 0.02);

  const note = { gain, source };
  lastPianoNote = note;
  source.onended = () => {
    if (lastPianoNote === note) lastPianoNote = null;
    gain.disconnect();
  };
  return true;
}

/* ---------- Synth voices ---------- */

/** What a synth voice built: its master gain and sources, so a scheduled note can be silenced early. */
type VoiceNodes = { master: GainNode; sources: AudioScheduledSourceNode[]; end: number };

/**
 * The original NotaNota note: sine body with a soft triangle octave. `at` schedules it,
 * `level` scales it (1 = the single-note level), and `seconds` lets a long note ring longer.
 */
function playSoft(audio: AudioContext, midi: number, at = audio.currentTime, level = 1, seconds = 0): VoiceNodes {
  const frequency = frequencyOf(midi);
  const master = audio.createGain();
  const body = audio.createOscillator();
  const warmth = audio.createOscillator();
  const warmthGain = audio.createGain();
  const decayEnd = at + Math.max(1.05, seconds + SCHEDULED_RELEASE);

  body.type = "sine";
  body.frequency.setValueAtTime(frequency, at);
  warmth.type = "triangle";
  warmth.frequency.setValueAtTime(frequency * 2, at);
  warmthGain.gain.setValueAtTime(0.09, at);

  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(0.32 * level, at + 0.018);
  master.gain.exponentialRampToValueAtTime(0.13 * level, at + 0.22);
  master.gain.exponentialRampToValueAtTime(0.0001, decayEnd);

  body.connect(master);
  warmth.connect(warmthGain);
  warmthGain.connect(master);
  master.connect(audio.destination);

  body.start(at);
  warmth.start(at);
  body.stop(decayEnd + 0.03);
  warmth.stop(decayEnd + 0.03);
  body.onended = () => master.disconnect();
  return { master, sources: [body, warmth], end: decayEnd + 0.03 };
}

/** Sums sine partials, each with its own level and decay, into one envelope. */
function playPartials(
  audio: AudioContext,
  midi: number,
  partials: ReadonlyArray<[ratio: number, level: number, decay: number]>,
  attack: number,
  at = audio.currentTime,
  level = 1,
): VoiceNodes {
  const frequency = frequencyOf(midi);
  const nyquist = audio.sampleRate / 2;
  const master = audio.createGain();
  const sources: AudioScheduledSourceNode[] = [];
  master.gain.setValueAtTime(level, at);
  master.connect(audio.destination);
  let end = at;
  for (const [ratio, partialLevel, decay] of partials) {
    if (frequency * ratio >= nyquist) continue;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * ratio, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(partialLevel, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(at);
    oscillator.stop(at + attack + decay + 0.02);
    sources.push(oscillator);
    end = Math.max(end, at + attack + decay + 0.02);
  }
  window.setTimeout(() => master.disconnect(), Math.ceil((end - audio.currentTime) * 1000) + 50);
  return { master, sources, end };
}

// Marimba bars are tuned so the first overtone sits two octaves up; both die fast.
const MARIMBA: ReadonlyArray<[number, number, number]> = [
  [1, 0.34, 0.75],
  [4, 0.1, 0.18],
  [9.9, 0.03, 0.06],
];

// Bell: inharmonic partials (hum, prime, tierce, quint, nominal) with long ringing.
const BELL: ReadonlyArray<[number, number, number]> = [
  [0.5, 0.08, 2.2],
  [1, 0.2, 1.8],
  [1.19, 0.08, 1.4],
  [1.5, 0.06, 1.1],
  [2, 0.09, 0.9],
  [2.74, 0.04, 0.5],
  [3.76, 0.025, 0.3],
];

/**
 * Plays one note in the chosen voice. If the piano sample is not loaded yet,
 * the soft synth plays this note and loading continues in the background.
 */
export function playVoiceNote(audio: AudioContext, midi: number, voice: NoteVoice) {
  if (voice === "piano") {
    warmPiano(audio, midi);
    if (!playPianoSample(audio, midi)) playSoft(audio, midi);
    return;
  }
  if (voice === "marimba") {
    playPartials(audio, midi, MARIMBA, 0.004);
    return;
  }
  if (voice === "bell") {
    playPartials(audio, midi, BELL, 0.003);
    return;
  }
  playSoft(audio, midi);
}

/* ---------- Scheduled, polyphonic notes ---------- */

/** Loads only the piano samples these notes need; resolves when each has loaded or failed. */
export function ensurePianoLoaded(audio: BaseAudioContext, midis: readonly number[]): Promise<void> {
  const samples = [...new Set(midis.map(nearestPianoSample))];
  return Promise.all(samples.map((sample) => loadPianoSample(audio, sample))).then(() => undefined);
}

/** True when every sample these notes need is decoded and ready. */
export function isPianoLoaded(audio: BaseAudioContext, midis: readonly number[]) {
  const { buffers } = pianoState(audio);
  return midis.every((midi) => buffers.has(nearestPianoSample(midi)));
}

function silence(audio: BaseAudioContext, master: GainNode, sources: readonly AudioScheduledSourceNode[], end: number) {
  const now = audio.currentTime;
  if (now >= end) return;
  try {
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + STOP_FADE);
    for (const source of sources) source.stop(now + STOP_FADE + 0.01);
  } catch {
    /* The note already ended or never started. */
  }
}

/**
 * Schedules one note at `at` (AudioContext time) for `seconds`, without damping any other
 * sounding note, and returns stop(), which fades it out in 30 ms. The piano uses its loaded
 * sample (pitched by playbackRate) with a 0.25 s release after the written length; `gain` is
 * its peak level (use CHORD_NOTE_GAIN when notes overlap). Without a loaded sample, and for the
 * other voices, the synth plays at the same time, scaled by gain / PIANO_GAIN.
 */
export function scheduleVoiceNote(audio: AudioContext, midi: number, at: number, seconds: number, voice: NoteVoice, gain = PIANO_GAIN): () => void {
  const start = Math.max(at, audio.currentTime);
  const level = gain / PIANO_GAIN;
  if (voice === "piano") {
    const sampleMidi = nearestPianoSample(midi);
    const buffer = pianoState(audio).buffers.get(sampleMidi);
    if (buffer) {
      const source = audio.createBufferSource();
      const envelope = audio.createGain();
      const releaseAt = start + Math.max(0.05, seconds);
      const end = releaseAt + SCHEDULED_RELEASE;
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(2 ** ((midi - sampleMidi) / 12), start);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(gain, start + 0.004);
      envelope.gain.setValueAtTime(gain, releaseAt);
      envelope.gain.linearRampToValueAtTime(0, end);
      source.connect(envelope);
      envelope.connect(audio.destination);
      source.start(start);
      source.stop(end + 0.02);
      source.onended = () => envelope.disconnect();
      return () => silence(audio, envelope, [source], end + 0.02);
    }
  }
  const nodes = voice === "marimba"
    ? playPartials(audio, midi, MARIMBA, 0.004, start, level)
    : voice === "bell"
      ? playPartials(audio, midi, BELL, 0.003, start, level)
      : playSoft(audio, midi, start, level, seconds);
  return () => silence(audio, nodes.master, nodes.sources, nodes.end);
}
