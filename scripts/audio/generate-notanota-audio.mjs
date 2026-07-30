import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_ROOT = path.join(ROOT, "audio-src", "notanota");
const SCORE_DIR = path.join(SOURCE_ROOT, "scores");
const MASTER_DIR = path.join(SOURCE_ROOT, "masters");
const WEB_DIR = path.join(ROOT, "public", "audio");
const TEMP_DIR = path.join(SOURCE_ROOT, ".render-temp");

const SAMPLE_RATE = 48_000;
const BPM = 64;
const BEAT_SECONDS = 60 / BPM;
const MUSIC_VOLUME = 0.15;
const EFFECT_VOLUME = 0.36;
const FIXED_SEED = 0x4e6f7461; // "Nota"
const MIDI_DIVISION = 480;

const NOTE_TO_MIDI = Object.freeze({
  C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59,
  C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71,
  C5: 72, D5: 74, Eb5: 75, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83,
  C6: 84,
});

const loopBars = [
  { chord: ["C3", "G3", "B3", "E4"], motif: [{ note: "C5", beat: 2.45, duration: 1.1, velocity: 42 }] },
  { chord: ["B3", "D4", "E4", "G4"], motif: [] },
  { chord: ["A3", "E4", "G4", "C5"], motif: [{ note: "E5", beat: 2.55, duration: 1.0, velocity: 43 }] },
  { chord: ["F3", "C4", "E4", "A4"], motif: [] },
  { chord: ["E3", "G3", "C4", "E4"], motif: [{ note: "G5", beat: 2.4, duration: 1.2, velocity: 44 }] },
  { chord: ["D3", "A3", "C4", "F4"], motif: [] },
  { chord: ["G3", "D4", "E4", "C5"], motif: [{ note: "D5", beat: 2.5, duration: 1.1, velocity: 40 }] },
  { chord: ["G3", "D4", "E4", "B4"], motif: [] },
];

const PIECES = Object.freeze([
  {
    id: "notanota-ambient-loop",
    title: "NotaNota Ambient Loop",
    bpm: BPM,
    durationSeconds: 32 * BEAT_SECONDS,
    loop: true,
    targetLufs: -23,
    truePeakLimit: -3,
    voices: [
      loopBars.flatMap((bar, index) => bar.chord.map((note) => ({
        note,
        beat: index * 4,
        duration: 3.55,
        velocity: 36 + ((index + NOTE_TO_MIDI[note]) % 8),
        voice: 1,
      }))),
      loopBars.flatMap((bar, index) => bar.motif.map((event) => ({
        ...event,
        beat: index * 4 + event.beat,
        voice: 2,
      }))),
    ],
  },
  {
    id: "notanota-session-start",
    title: "NotaNota Session Start",
    bpm: 96,
    durationSeconds: 2.2,
    truePeakLimit: -5,
    voices: [[
      { note: "C5", beat: 0.05, duration: 0.34, velocity: 45 },
      { note: "E5", beat: 0.52, duration: 0.34, velocity: 46 },
      { note: "G5", beat: 1.00, duration: 0.36, velocity: 47 },
      { note: "D5", beat: 1.52, duration: 1.18, velocity: 42 },
    ]],
    secondsAsBeats: true,
  },
  {
    id: "notanota-correct",
    title: "NotaNota Correct",
    bpm: 120,
    durationSeconds: 0.55,
    truePeakLimit: -5,
    voices: [[
      { note: "E5", beat: 0.025, duration: 0.22, velocity: 47 },
      { note: "G5", beat: 0.245, duration: 0.29, velocity: 49 },
    ]],
    secondsAsBeats: true,
  },
  {
    id: "notanota-incorrect",
    title: "NotaNota Incorrect",
    bpm: 100,
    durationSeconds: 0.7,
    truePeakLimit: -5,
    voices: [[
      { note: "Eb5", beat: 0.035, duration: 0.31, velocity: 40 },
      { note: "D5", beat: 0.35, duration: 0.33, velocity: 38 },
    ]],
    secondsAsBeats: true,
  },
  {
    id: "notanota-streak",
    title: "NotaNota Streak",
    bpm: 100,
    durationSeconds: 1.3,
    truePeakLimit: -5,
    voices: [[
      { note: "C5", beat: 0.03, duration: 0.34, velocity: 44 },
      { note: "E5", beat: 0.38, duration: 0.38, velocity: 46 },
      { note: "G5", beat: 0.78, duration: 0.50, velocity: 48 },
    ]],
    secondsAsBeats: true,
  },
  {
    id: "notanota-lesson-complete",
    title: "NotaNota Lesson Complete",
    bpm: 92,
    durationSeconds: 2.8,
    truePeakLimit: -5,
    voices: [[
      { note: "C5", beat: 0.05, duration: 0.35, velocity: 43 },
      { note: "E5", beat: 0.43, duration: 0.36, velocity: 45 },
      { note: "G5", beat: 0.83, duration: 0.40, velocity: 47 },
      { note: "D5", beat: 1.28, duration: 0.46, velocity: 42 },
      { note: "C6", beat: 1.82, duration: 0.96, velocity: 46 },
    ]],
    secondsAsBeats: true,
  },
  {
    id: "notanota-ui-click",
    title: "NotaNota UI Click",
    bpm: 120,
    durationSeconds: 0.12,
    truePeakLimit: -5,
    voices: [[
      { note: "C4", beat: 0.004, duration: 0.105, velocity: 35 },
    ]],
    secondsAsBeats: true,
    quieter: true,
  },
]);

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function midiFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function secondsFor(piece, value) {
  return piece.secondsAsBeats ? value : value * 60 / piece.bpm;
}

function musicalBeats(piece, value) {
  return piece.secondsAsBeats ? value / (60 / piece.bpm) : value;
}

function addPianoNote(channels, event, piece, offsetSeconds, seed) {
  const midi = NOTE_TO_MIDI[event.note];
  const frequency = midiFrequency(midi);
  const start = Math.round((offsetSeconds + secondsFor(piece, event.beat)) * SAMPLE_RATE);
  const writtenDuration = secondsFor(piece, event.duration);
  const release = piece.id === "notanota-ui-click" ? 0.02 : Math.min(0.82, Math.max(0.18, writtenDuration * 0.72));
  const totalDuration = Math.min(piece.durationSeconds, writtenDuration + release);
  const end = Math.min(channels[0].length, start + Math.round(totalDuration * SAMPLE_RATE));
  const velocity = event.velocity / 127;
  const pan = Math.max(-0.26, Math.min(0.26, (midi - 66) / 70));
  const leftGain = Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = Math.sin((pan + 1) * Math.PI / 4);
  const random = mulberry32(seed ^ (midi * 2654435761) ^ start);
  const phases = [0, random() * 0.22, random() * 0.18, random() * 0.12];
  let filteredNoise = 0;

  for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
    const time = (sampleIndex - start) / SAMPLE_RATE;
    const attack = Math.min(1, time / (piece.id === "notanota-ui-click" ? 0.0025 : 0.010));
    const decayRate = piece.loop ? 0.72 : piece.id === "notanota-ui-click" ? 24 : 2.45;
    const decay = Math.exp(-time * decayRate);
    const releaseStart = Math.max(0.03, writtenDuration * 0.78);
    const releaseEnvelope = time <= releaseStart
      ? 1
      : Math.max(0, 1 - (time - releaseStart) / Math.max(0.01, totalDuration - releaseStart));
    const envelope = attack * decay * releaseEnvelope;
    const brightness = Math.exp(-time * 4.1);
    let tone = 0;
    const partials = [
      [1, 1],
      [2.003, 0.27],
      [3.011, 0.115],
      [4.023, 0.045],
    ];

    for (let partial = 0; partial < partials.length; partial += 1) {
      const [multiple, amplitude] = partials[partial];
      tone += Math.sin(2 * Math.PI * frequency * multiple * time + phases[partial])
        * amplitude
        * (partial === 0 ? 1 : 0.54 + brightness * 0.46);
    }

    filteredNoise = filteredNoise * 0.82 + (random() * 2 - 1) * 0.18;
    const felt = filteredNoise * Math.exp(-time * 34) * 0.025;
    const body = (tone * 0.78 + felt) * envelope * velocity;
    channels[0][sampleIndex] += body * leftGain;
    channels[1][sampleIndex] += body * rightGain;
  }
}

function addRoom(channels) {
  const sourceLeft = channels[0].slice();
  const sourceRight = channels[1].slice();
  const taps = [
    [0.041, 0.060],
    [0.067, 0.040],
    [0.103, 0.026],
  ];

  for (const [seconds, gain] of taps) {
    const delay = Math.round(seconds * SAMPLE_RATE);
    for (let index = delay; index < channels[0].length; index += 1) {
      channels[0][index] += (sourceLeft[index - delay] * 0.72 + sourceRight[index - delay] * 0.28) * gain;
      channels[1][index] += (sourceRight[index - delay] * 0.72 + sourceLeft[index - delay] * 0.28) * gain;
    }
  }
}

function applyEdgeFades(channels, durationSeconds, isLoop) {
  if (isLoop) return;
  const fadeIn = Math.max(1, Math.round(Math.min(0.006, durationSeconds * 0.08) * SAMPLE_RATE));
  const fadeOut = Math.max(1, Math.round(Math.min(0.014, durationSeconds * 0.12) * SAMPLE_RATE));
  for (const channel of channels) {
    for (let index = 0; index < fadeIn; index += 1) channel[index] *= index / fadeIn;
    for (let index = 0; index < fadeOut; index += 1) {
      const target = channel.length - 1 - index;
      channel[target] *= index / fadeOut;
    }
  }
}

function normalizeChannels(channels, targetRms, maxPeak) {
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      peak = Math.max(peak, Math.abs(sample));
      if (Math.abs(sample) > 1e-5) {
        sum += sample * sample;
        count += 1;
      }
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  const gain = Math.min(targetRms / Math.max(1e-9, rms), maxPeak / Math.max(1e-9, peak));
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) channel[index] *= gain;
  }
}

function renderPiece(piece) {
  const repeatCount = piece.loop ? 3 : 1;
  const samplesPerCycle = Math.round(piece.durationSeconds * SAMPLE_RATE);
  const channels = [
    new Float64Array(samplesPerCycle * repeatCount),
    new Float64Array(samplesPerCycle * repeatCount),
  ];

  for (let repeat = 0; repeat < repeatCount; repeat += 1) {
    const offset = repeat * piece.durationSeconds;
    piece.voices.flat().forEach((event, eventIndex) => {
      addPianoNote(channels, event, piece, offset, FIXED_SEED ^ (repeat * 4099) ^ eventIndex);
    });
  }
  addRoom(channels);

  let rendered = channels;
  if (piece.loop) {
    rendered = channels.map((channel) => channel.slice(samplesPerCycle, samplesPerCycle * 2));
  }
  applyEdgeFades(rendered, piece.durationSeconds, piece.loop);
  normalizeChannels(
    rendered,
    piece.loop ? 0.055 : piece.quieter ? 0.045 : 0.085,
    piece.loop ? 0.40 : piece.quieter ? 0.20 : 0.34,
  );
  return rendered;
}

function writeInt24LE(buffer, value, offset) {
  const signed = value < 0 ? value + 0x1000000 : value;
  buffer[offset] = signed & 0xff;
  buffer[offset + 1] = (signed >>> 8) & 0xff;
  buffer[offset + 2] = (signed >>> 16) & 0xff;
}

function encodeWav24(channels) {
  const samples = channels[0].length;
  const blockAlign = 6;
  const dataLength = samples * blockAlign;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(24, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  let offset = 44;
  for (let index = 0; index < samples; index += 1) {
    for (let channel = 0; channel < 2; channel += 1) {
      const value = Math.max(-1, Math.min(1, channels[channel][index]));
      writeInt24LE(buffer, Math.round(value * 8_388_607), offset);
      offset += 3;
    }
  }
  return buffer;
}

function variableLength(value) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function midiFile(piece) {
  const totalTicks = Math.round(piece.durationSeconds / (60 / piece.bpm) * MIDI_DIVISION);
  const beatToTicks = (beat) => Math.round(musicalBeats(piece, beat) * MIDI_DIVISION);
  const events = [];
  piece.voices.flat().forEach((event) => {
    const start = beatToTicks(event.beat);
    const end = Math.min(totalTicks, beatToTicks(event.beat + event.duration));
    events.push({ tick: start, priority: 1, data: [0x90, NOTE_TO_MIDI[event.note], event.velocity] });
    events.push({ tick: end, priority: 0, data: [0x80, NOTE_TO_MIDI[event.note], 0] });
  });
  events.sort((a, b) => a.tick - b.tick || a.priority - b.priority);

  const tempo = Math.round(60_000_000 / piece.bpm);
  const track = [
    0x00, 0xff, 0x51, 0x03, (tempo >>> 16) & 0xff, (tempo >>> 8) & 0xff, tempo & 0xff,
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
    0x00, 0xc0, 0x00,
  ];
  let previousTick = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - previousTick), ...event.data);
    previousTick = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = Buffer.alloc(14);
  header.write("MThd", 0);
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(MIDI_DIVISION, 12);
  const trackHeader = Buffer.alloc(8);
  trackHeader.write("MTrk", 0);
  trackHeader.writeUInt32BE(track.length, 4);
  return Buffer.concat([header, trackHeader, Buffer.from(track)]);
}

function pitchXml(noteName) {
  const match = /^([A-G])([b#]?)(\d)$/.exec(noteName);
  if (!match) throw new Error(`Unsupported pitch ${noteName}`);
  const alter = match[2] === "b" ? "<alter>-1</alter>" : match[2] === "#" ? "<alter>1</alter>" : "";
  return `<pitch><step>${match[1]}</step>${alter}<octave>${match[3]}</octave></pitch>`;
}

function musicXml(piece) {
  const divisions = MIDI_DIVISION;
  const totalBeats = piece.durationSeconds / (60 / piece.bpm);
  const measureCount = piece.loop ? 8 : 1;
  const measures = [];

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const measureStart = measureIndex * 4;
    const measureBeats = piece.loop ? 4 : totalBeats;
    const measureDuration = Math.round(measureBeats * divisions);
    const body = [];
    piece.voices.forEach((voiceEvents, voiceIndex) => {
      const voice = voiceIndex + 1;
      if (voiceIndex > 0) body.push(`<backup><duration>${measureDuration}</duration></backup>`);
      const groups = Map.groupBy(
        voiceEvents
          .map((event) => ({
            ...event,
            absoluteStart: musicalBeats(piece, event.beat),
            absoluteEnd: Math.min(totalBeats, musicalBeats(piece, event.beat + event.duration)),
          }))
          .filter((event) => event.absoluteStart >= measureStart && event.absoluteStart < measureStart + measureBeats)
          .map((event) => ({
            ...event,
            start: Math.round((event.absoluteStart - measureStart) * divisions),
            xmlDuration: Math.max(1, Math.round((event.absoluteEnd - event.absoluteStart) * divisions)),
          }))
          .sort((a, b) => a.start - b.start || NOTE_TO_MIDI[a.note] - NOTE_TO_MIDI[b.note]),
        (event) => event.start,
      );
      let cursor = 0;
      for (const [start, events] of groups) {
        if (start > cursor) body.push(`<note><rest/><duration>${start - cursor}</duration><voice>${voice}</voice></note>`);
        events.forEach((event, chordIndex) => {
          body.push(`<note>${chordIndex ? "<chord/>" : ""}${pitchXml(event.note)}<duration>${event.xmlDuration}</duration><voice>${voice}</voice><velocity>${event.velocity}</velocity></note>`);
        });
        cursor = Math.max(cursor, start + Math.max(...events.map((event) => event.xmlDuration)));
      }
      if (cursor < measureDuration) body.push(`<note><rest/><duration>${measureDuration - cursor}</duration><voice>${voice}</voice></note>`);
    });
    const attributes = measureIndex === 0
      ? `<attributes><divisions>${divisions}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${piece.bpm}</per-minute></metronome></direction-type><sound tempo="${piece.bpm}"/></direction>`
      : "";
    measures.push(`<measure number="${measureIndex + 1}"${piece.loop ? "" : ' implicit="yes"'}>${attributes}${body.join("")}</measure>`);
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${piece.title}</work-title></work>
  <identification><creator type="composer">NotaNota original audio system</creator><encoding><software>generate-notanota-audio.mjs</software></encoding></identification>
  <part-list><score-part id="P1"><part-name>Soft Piano</part-name><score-instrument id="P1-I1"><instrument-name>Soft Piano</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument></score-part></part-list>
  <part id="P1">${measures.join("")}</part>
</score-partwise>
`;
}

function runFfmpeg(args, options = {}) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-nostdin", ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function parseLoudnorm(stderr) {
  const matches = [...stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  if (!matches.length) throw new Error(`Could not parse loudness data:\n${stderr}`);
  return JSON.parse(matches.at(-1)[0]);
}

function measureAudio(file) {
  const result = runFfmpeg([
    "-i", file,
    "-af", "loudnorm=I=-23:LRA=7:TP=-3:print_format=json",
    "-f", "null",
    process.platform === "win32" ? "NUL" : "/dev/null",
  ]);
  return parseLoudnorm(result.stderr);
}

function normalizeLoop(input, output) {
  const firstPass = measureAudio(input);
  const filter = [
    "loudnorm=I=-23:LRA=7:TP=-3",
    `measured_I=${firstPass.input_i}`,
    `measured_LRA=${firstPass.input_lra}`,
    `measured_TP=${firstPass.input_tp}`,
    `measured_thresh=${firstPass.input_thresh}`,
    `offset=${firstPass.target_offset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
  runFfmpeg([
    "-y", "-i", input,
    "-af", filter,
    "-ar", String(SAMPLE_RATE),
    "-c:a", "pcm_s24le",
    output,
  ]);
}

function encodeWeb(master, piece) {
  const opus = path.join(WEB_DIR, `${piece.id}.ogg`);
  const mp3 = path.join(WEB_DIR, `${piece.id}.mp3`);
  runFfmpeg([
    "-y", "-i", master,
    "-map_metadata", "-1",
    "-fflags", "+bitexact",
    "-flags:a", "+bitexact",
    "-c:a", "libopus",
    "-b:a", piece.loop ? "64k" : "40k",
    "-vbr", "on",
    "-application", "audio",
    opus,
  ]);
  runFfmpeg([
    "-y", "-i", master,
    "-map_metadata", "-1",
    "-fflags", "+bitexact",
    "-flags:a", "+bitexact",
    "-c:a", "libmp3lame",
    "-b:a", piece.loop ? "96k" : "64k",
    "-ar", String(SAMPLE_RATE),
    mp3,
  ]);
  for (const file of [opus, mp3]) {
    runFfmpeg(["-v", "error", "-i", file, "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"]);
  }
  return { opus, mp3 };
}

function levelDb(value) {
  return value <= 1e-12 ? -120 : 20 * Math.log10(value);
}

function waveformMetrics(channels, piece) {
  const edgeSamples = Math.max(1, Math.round(Math.min(0.5, piece.durationSeconds / 2) * SAMPLE_RATE));
  const rms = (start, end) => {
    let sum = 0;
    let count = 0;
    for (const channel of channels) {
      for (let index = start; index < end; index += 1) {
        sum += channel[index] ** 2;
        count += 1;
      }
    }
    return Math.sqrt(sum / Math.max(1, count));
  };
  const boundaryDelta = Math.max(
    Math.abs(channels[0][0] - channels[0].at(-1)),
    Math.abs(channels[1][0] - channels[1].at(-1)),
  );
  let halfSecondDifference = 0;
  if (piece.loop) {
    let sum = 0;
    let count = 0;
    for (const channel of channels) {
      for (let index = 0; index < edgeSamples; index += 1) {
        const difference = channel[index] - channel[channel.length - edgeSamples + index];
        sum += difference * difference;
        count += 1;
      }
    }
    halfSecondDifference = Math.sqrt(sum / count);
  }
  return {
    first500msRmsDbfs: Number(levelDb(rms(0, edgeSamples)).toFixed(2)),
    last500msRmsDbfs: Number(levelDb(rms(channels[0].length - edgeSamples, channels[0].length)).toFixed(2)),
    boundaryDeltaDbfs: Number(levelDb(boundaryDelta).toFixed(2)),
    edge500msDifferenceDbfs: piece.loop ? Number(levelDb(halfSecondDifference).toFixed(2)) : null,
  };
}

async function sha256(file) {
  const content = await readFile(file);
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  await Promise.all([SCORE_DIR, MASTER_DIR, WEB_DIR, TEMP_DIR].map((directory) => mkdir(directory, { recursive: true })));
  const report = {
    generatorVersion: "2026-07",
    deterministicSeed: `0x${FIXED_SEED.toString(16)}`,
    sampleRate: SAMPLE_RATE,
    bitDepth: 24,
    musicPlaybackVolume: MUSIC_VOLUME,
    effectPlaybackVolume: EFFECT_VOLUME,
    ffmpeg: "ffmpeg-static 5.3.0 / FFmpeg 6.1.1 gyan.dev essentials build",
    pieces: [],
  };

  for (const piece of PIECES) {
    const channels = renderPiece(piece);
    const rawMaster = path.join(TEMP_DIR, `${piece.id}-raw.wav`);
    const master = path.join(MASTER_DIR, `${piece.id}.wav`);
    await writeFile(rawMaster, encodeWav24(channels));
    await writeFile(path.join(SCORE_DIR, `${piece.id}.mid`), midiFile(piece));
    await writeFile(path.join(SCORE_DIR, `${piece.id}.musicxml`), musicXml(piece));

    if (piece.loop) normalizeLoop(rawMaster, master);
    else await writeFile(master, await readFile(rawMaster));

    const web = encodeWeb(master, piece);
    const loudness = measureAudio(master);
    const files = {};
    for (const [format, file] of Object.entries({ wav: master, ogg: web.opus, mp3: web.mp3 })) {
      const content = await readFile(file);
      files[format] = {
        path: path.relative(ROOT, file).replaceAll("\\", "/"),
        bytes: content.length,
        sha256: await sha256(file),
      };
    }

    report.pieces.push({
      id: piece.id,
      durationSeconds: piece.durationSeconds,
      bpm: piece.bpm,
      loop: Boolean(piece.loop),
      integratedLufs: Number(loudness.input_i),
      truePeakDbtp: Number(loudness.input_tp),
      sampleRate: SAMPLE_RATE,
      bitDepth: 24,
      ...waveformMetrics(channels, piece),
      files,
    });
  }

  await writeFile(
    path.join(SOURCE_ROOT, "audio-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await rm(TEMP_DIR, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
