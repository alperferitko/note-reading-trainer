import { analyzeItems, contextKey, validEvidence } from './practice-evidence.mjs';
import { pitchAt, pitchName } from './music-pitch.mjs';
import { buildSessionInsight } from './session-insights.mjs';
import { evaluatePattern, patternTiming, RHYTHM_PATTERNS } from './pulse-practice.mjs';

/** Pure device-local assessment. History is restricted to contexts seen this session. */
export function assessLearning(records, session, locale = 'tr', now = Date.now()) {
  const rows = validEvidence(records, now).filter(row => Date.parse(row.at) <= now && row.module === 'reading');
  const current = rows.filter(row => row.session === session);
  const unaided = current.filter(row => !row.assisted);
  const seen = new Set(current.map(contextKey));
  const contexts = analyzeItems(rows, {}, now).filter(item => seen.has(item.key));
  const weaknesses = contexts.filter(item => item.status === 'needs-work').slice(0, 3).map(item => ({
    id: item.key, label: item.position === undefined ? (locale === 'tr' ? 'Nota okuma bağlamı' : 'Note-reading context')
      : `${pitchName(pitchAt(item.position, item.clef, item.accidental ?? 0), locale, true)} · ${item.clef === 'bass' ? (locale === 'tr' ? 'fa anahtarı' : 'bass clef') : (locale === 'tr' ? 'sol anahtarı' : 'treble clef')}`,
    attempts: item.recentAttempts, errors: item.recentErrors,
  }));
  const correct = current.filter(row => row.correct).length;
  const wrong = current.length - correct;
  const times = current.filter(row => row.responseMs !== null);
  const insight = buildSessionInsight({ locale, sessionType: 'standard', completed: false,
    firstTryRate: unaided.length ? Math.round(unaided.filter(row => row.correct).length / unaided.length * 100) : 0,
    totalWrong: wrong, attemptCount: current.length, correctCount: correct,
    averageResponseMs: times.length ? times.reduce((sum, row) => sum + row.responseMs, 0) / times.length : 0 });
  const lessonId = current.some(row => row.accidental) ? 'accidentals'
    : current.some(row => row.clef === 'bass') ? 'bass-clef' : 'treble-anchors';
  const tr = locale === 'tr';
  return {
    eligible: unaided.length >= 3, attempts: current.length, correct, wrong, unaidedAttempts: unaided.length,
    weaknesses, explanation: insight.body,
    suggestions: [
      { id: 'repeat', target: 'repeat', text: tr ? 'Aynı ayarlarla kısa bir tur daha yap; cevaptan önce anahtarı ve oktavı kontrol et.' : 'Repeat a short round with the same settings; check the clef and octave before answering.' },
      { id: 'lesson', target: 'lesson', lessonId, text: tr ? 'Anahtar ve değiştirici işaretler için kısa dersi oku, ardından yeni örneklerle dene.' : 'Review the short clef/accidental lesson, then try fresh examples.' },
      { id: 'progress', target: 'progress', text: tr ? 'Beceri haritasında aynı bağlamdaki yardımsız denemeleri karşılaştır; tek hatadan sonuç çıkarma.' : 'Compare unaided attempts in the same context on your skill map; do not generalise from one mistake.' },
    ],
  };
}

/** Explicitly labelled browser demo, no backend import, auth bypass or network.
 * @param {ReturnType<typeof assessLearning>} assessment
 * @param {{signal?:AbortSignal,delayMs?:number}} [options]
 */
export async function requestTeacherDemo(assessment, { signal, delayMs = 200 } = {}) {
  await new Promise((resolve, reject) => {
    let timer;
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new Error('demo_cancelled')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delayMs);
  });
  return { schemaVersion: '1', mode: 'mock', assessment: structuredClone(assessment) };
}

/** For future rhythm UI integration; taps are measured by existing code, never LLMs. */
export function analyzeTeacherRhythm(taps, bpm, patternId) {
  const pattern = RHYTHM_PATTERNS.find(item => item.id === patternId);
  if (!pattern || !Array.isArray(taps) || taps.length > 512 || !taps.every(Number.isFinite)) throw new RangeError('Invalid rhythm evidence');
  return evaluatePattern(taps, bpm, patternTiming(pattern));
}