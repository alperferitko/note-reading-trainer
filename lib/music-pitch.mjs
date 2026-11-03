// Each position is one diatonic step; MIDI is the sounding pitch.
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];
export function pitchAt(position, clef = 'treble', accidental = 0) {
  const index = (clef === 'bass' ? 2 * 7 + 4 : 4 * 7 + 2) + position;
  const degree = ((index % 7) + 7) % 7;
  const octave = Math.floor(index / 7);
  const letter = LETTERS[degree];
  return { id: `${letter.toLowerCase()}${octave}${accidental === 1 ? '#' : accidental === -1 ? 'b' : ''}`, letter, solfege: SOLFEGE[degree], octave, position, accidental, clef, midi: (octave + 1) * 12 + SEMITONES[degree] + accidental };
}
// Note names follow the page language unless the user picked a system in Settings.
export const NOTE_NAMES_KEY = 'notanota-note-names-v1';
/** @typedef {'auto'|'solfege'|'letters'} NoteNaming */
/** @type {NoteNaming|null} */
let naming = null;
/** @returns {NoteNaming} */
export function readNoteNaming() {
  if (naming) return naming;
  let stored = null;
  try { stored = globalThis.localStorage?.getItem(NOTE_NAMES_KEY) ?? null; } catch { stored = null; }
  naming = stored === 'solfege' || stored === 'letters' ? stored : 'auto';
  return naming;
}
/** @param {NoteNaming} value */
export function writeNoteNaming(value) {
  naming = value === 'solfege' || value === 'letters' ? value : 'auto';
  try { globalThis.localStorage?.setItem(NOTE_NAMES_KEY, naming); } catch { /* Preference only. */ }
}
/** The naming system to use for a page in `locale`: 'tr' means Do-Re-Mi, 'en' means C-D-E. */
export function namesLocale(locale = 'tr') {
  const value = readNoteNaming();
  return value === 'solfege' ? 'tr' : value === 'letters' ? 'en' : locale === 'tr' ? 'tr' : 'en';
}
export function pitchName(note, locale = 'tr', octave = false) {
  return `${namesLocale(locale) === 'tr' ? note.solfege : note.letter}${note.accidental === 1 ? '♯' : note.accidental === -1 ? '♭' : ''}${octave ? note.octave : ''}`;
}
export function parsePitchAnswer(value) {
  const text = String(value).trim().toLocaleLowerCase('tr-TR').replaceAll('ı', 'i').replaceAll('♯', '#').replaceAll('♭', 'b').replace(/\s+/g, '').replace(/diyez$/, '#').replace(/bemol$/, 'b').replace(/sharp$/, '#').replace(/flat$/, 'b');
  for (let i = 0; i < LETTERS.length; i++) {
    for (const name of [LETTERS[i].toLowerCase(), SOLFEGE[i].toLowerCase()]) {
      if (text === name || text === `${name}#` || text === `${name}b`) return { letter: LETTERS[i], accidental: text.slice(name.length) === '#' ? 1 : text.slice(name.length) === 'b' ? -1 : 0 };
    }
  }
  return null;
}
export function matchesPitch(value, expected) {
  const parsed = parsePitchAnswer(value);
  return parsed?.letter === expected.letter && parsed.accidental === (expected.accidental || 0);
}
// A physical key can correctly be named using either enharmonic spelling.
// Written-score questions deliberately keep the stricter matchesPitch check.
export function matchesSoundingPitch(value, midi) {
  const parsed = parsePitchAnswer(value);
  if (!parsed) return false;
  const semitone = SEMITONES[LETTERS.indexOf(parsed.letter)] + parsed.accidental;
  return ((semitone % 12) + 12) % 12 === ((midi % 12) + 12) % 12;
}
export function accidentalsFor(mode) {
  return mode === 'sharp' ? [1] : mode === 'flat' ? [-1] : mode === 'mixed' ? [0, 1, -1] : [0];
}
export function pitchFromMidi(midi, clef = 'treble') {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  const degree = SEMITONES.findLastIndex(n => n <= pc);
  return pitchAt(octave * 7 + degree - (clef === 'bass' ? 18 : 30), clef, pc - SEMITONES[degree]);
}
