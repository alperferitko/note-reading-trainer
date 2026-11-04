// Allowlists the model may name. They mirror the app's own catalogues (ALL_NOTES ids in
// app/page.tsx, LEARNING_LESSONS ids in lib/learning-path.mjs); tests/ai-teacher.test.mjs fails
// when either side drifts. Kept here, inside supabase/functions, so the Edge bundle never imports
// beyond its own folder.

/** Treble-clef staff positions the reading drill can show (ALL_NOTES ids, natural notes only). */
export const TREBLE_NOTE_IDS = Object.freeze([
  'b2', 'c3', 'd3', 'e3', 'f3', 'g3', 'a3', 'b3', 'c4', 'd4', 'e4', 'f4', 'g4', 'a4', 'b4', 'c5',
  'd5', 'e5', 'f5', 'g5', 'a5', 'b5', 'c6', 'd6', 'e6', 'f6', 'g6', 'a6', 'b6', 'c7', 'd7', 'e7',
]);

export const STUDIO_IDS = Object.freeze(['reading', 'rhythm', 'score', 'ear', 'instrument', 'lessons']);

export const LESSON_IDS = Object.freeze([
  'staff-basics', 'treble-anchors', 'ledger-lines', 'octaves', 'pulse-tempo', 'note-values', 'subdivisions',
  'rests-measures', 'accidentals', 'bass-clef', 'guitar-map', 'piano-map', 'dotted-notes', 'rest-entries',
  'key-signatures', 'guitar-first-position', 'guitar-unisons', 'piano-bass-keys', 'piano-black-keys',
  'violin-strings', 'violin-first-position', 'violin-low-high', 'intervals-intro', 'triads-intro',
]);

export const SUGGESTION_KINDS = Object.freeze(['focus-drill', 'studio', 'lesson']);

export const PROFILE_ENUMS = Object.freeze({
  purpose: Object.freeze(['hobby', 'detailed']),
  instrument: Object.freeze(['piano', 'guitar', 'violin', 'voice', 'flute', 'other', 'none']),
  level: Object.freeze(['none', 'beginner', 'some', 'reads']),
});
export const PROFILE_FIELDS = Object.freeze(['purpose', 'instrument', 'level', 'weeklyMinutes', 'interests']);
export const MAX_WEEKLY_MINUTES = 1200;
export const MAX_INTERESTS_CHARS = 120;

// Conversation bounds. The request is rejected beyond them; the Meta adapter then drops the
// oldest turns (never the latest user message) if the ASCII wire body still exceeds its limit.
export const CHAT_LIMITS = Object.freeze({ maxTurns: 12, maxMessageChars: 600, maxTotalChars: 4000 });
export const CHAT_REPLY_CHARS = 900;
export const SUGGESTION_LABEL_CHARS = 80;

export const WEEKLY_LIMITS = Object.freeze({
  maxStruggles: 10, maxPieces: 5, maxPieceTitleChars: 80, maxCount: 100000, maxSessions: 10000,
  headlineChars: 120, narrativeChars: 900, highlightChars: 200, maxHighlights: 3,
});
// A note in noteStruggles: clef, letter, octave and an optional accidental, e.g. 'treble:g4', 'bass:f3#'.
export const STRUGGLE_NOTE = /^(treble|bass):[a-g][0-8](#|b)?$/;

// The teacher may also ask about things that are not saved profile fields: where the learner feels weak
// and which days they do not want to practise. The weekly plan it proposes covers all seven days.
export const ASK_FIELDS = Object.freeze([...PROFILE_FIELDS, 'struggles', 'restDays']);
export const WEEK_DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export const PLAN_FOCUS_CHARS = 60;
export const PLAN_DAY_MINUTES = 300;

// score-screen: one JPEG contact sheet of an uploaded file's pages, judged before the file is saved.
// maxDataChars bounds the base64 string; maxBodyBytes is this task's HTTP body cap (310 KiB), the only
// body allowed above the gateway's usual 256 KiB. maxOutputTokens is well under the 800 output cap.
export const SCREEN_LIMITS = Object.freeze({
  maxDataChars: 300000, minSide: 64, maxSide: 1024, maxPages: 8, notesChars: 200,
  maxBodyBytes: 317440, maxOutputTokens: 200,
});
export const SCREEN_VERDICTS = Object.freeze(['score', 'not_score', 'unclear']);
export const SCREEN_CATEGORIES = Object.freeze(['none', 'sexual', 'violence', 'hate', 'self_harm', 'personal_data', 'other']);
export const SCREEN_HANDWRITING = Object.freeze(['none', 'light', 'covers_notes']);
/**
 * Conservative image-token estimate for the pre-send budget guard. Meta publishes only an approximate
 * ~1300-1500 tokens for a 1280 px image; one token per 28x28 px tile, doubled, stays above that figure
 * (1280x1280 would give 4,232; the largest accepted 1024x1024 gives 2,738).
 */
export const screenImageTokens = (width, height) => Math.ceil(width / 28) * Math.ceil(height / 28) * 2;
