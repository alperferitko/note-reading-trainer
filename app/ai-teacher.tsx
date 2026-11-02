"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { assessLearning } from '@/lib/ai-learning.mjs';
import { buildFeedbackRequest, deterministicResult, describeMeasurement, gatewayEndpoint, idempotencyKeyFor, requestTeacherFeedback } from '@/lib/ai-client.mjs';
import { analyzeItems, validEvidence, type EvidenceRecord } from '@/lib/practice-evidence.mjs';
import { pitchAt, pitchName } from '@/lib/music-pitch.mjs';
import { supabase } from '@/lib/supabase';
import './ai-teacher.css';

type Module = 'reading' | 'score' | 'piano' | 'guitar' | 'violin';
type Feedback = { summary: string; observations: { text: string; evidenceRefs: string[] }[]; exercises: { id: string; contextRef: string; repetitions: number }[]; limitations: string[] };
type TeacherResult = Omit<ReturnType<typeof deterministicResult>, 'result' | 'mode'> & { mode: string; result: Feedback; requestId?: string | null };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? null;
const configured = gatewayEndpoint(import.meta.env.VITE_AI_GATEWAY_URL?.trim());
// The user's token is only sent to the gateway of the same Supabase project that issued it.
const endpoint = configured && (configured.kind === 'local' || (() => { try { return new URL(supabaseUrl).host === new URL(configured.url).host; } catch { return false; } })()) ? configured : null;

const REASONS: Record<string, [string, string]> = {
  gateway_not_configured: ['Canlı AI bu sürümde bağlı değil.', 'Live AI is not connected in this build.'],
  sign_in_required: ['Canlı AI için giriş yapman gerekir.', 'Sign in to use live AI.'],
  insufficient_evidence: ['Kişisel yorum için aynı notada en az 3 yardımsız cevap gerekir.', 'A personal comment needs at least 3 unaided answers on the same note.'],
  no_evidence: ['Bu oturumda ölçülmüş cevap yok.', 'No measured answers in this session.'],
  quota_exceeded: ['Bugünkü AI kullanım sınırına ulaşıldı.', 'Today’s AI usage limit has been reached.'],
  timeout: ['AI zamanında yanıt vermedi.', 'The AI did not answer in time.'],
  backend_not_configured: ['AI sunucusu şu an kapalı.', 'The AI server is switched off right now.'],
  live_calls_disabled: ['Canlı model çağrıları kapalı.', 'Live model calls are switched off.'],
  invalid_model_response: ['Model yanıtı doğrulamadan geçmedi, gösterilmedi.', 'The model answer failed validation and was not shown.'],
  evidence_mismatch: ['Yanıt bu oturumun ölçümleriyle eşleşmedi, gösterilmedi.', 'The answer did not match this session’s measurements and was not shown.'],
};
const LIMITS: Record<string, [string, string]> = {
  client_reported_not_verified: ['Ölçümler bu cihazdaki cevaplardan gelir; sunucu tarafından doğrulanmaz.', 'Measurements come from answers on this device and are not verified by a server.'],
  no_audio_pitch_measurement: ['Ses perdesi ölçülmedi; yalnızca ekran cevapları değerlendirildi.', 'No audio pitch was measured; only on-screen answers were evaluated.'],
  historical_tap_details_unavailable: ['Geçmiş ritim vuruşlarının ayrıntısı kullanılmadı.', 'Past rhythm tap details were not used.'],
  insufficient_recent_unaided_evidence: ['Son yardımsız cevaplar kişisel yorum için yetersiz.', 'Recent unaided answers are too few for a personal comment.'],
  mock_not_live_inference: ['Bu bir test yanıtıdır; gerçek modelden gelmedi.', 'This is a test answer; it did not come from a real model.'],
};

export function AITeacher({ locale, session, evidence, onRepeat, onProgress, onPractiseWeak, module = 'reading' }: {
  locale: 'tr' | 'en'; session: string; evidence: EvidenceRecord[]; onRepeat: () => void; onProgress: () => void;
  onPractiseWeak?: () => void; module?: Module;
}) {
  const tr = locale === 'tr';
  const pick = (pair: [string, string] | undefined, fallback: string) => pair ? pair[tr ? 0 : 1] : fallback;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TeacherResult | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    let alive = true;
    supabase?.auth.getSession().then(({ data }) => { if (alive) setSignedIn(Boolean(data.session)); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const request = useMemo(() => buildFeedbackRequest(evidence, { session, module, locale }), [evidence, session, module, locale]);
  const assessment = useMemo(() => module === 'reading' ? assessLearning(evidence, session, locale) : null, [evidence, session, locale, module]);
  const fallback = useMemo<TeacherResult>(() => deterministicResult(request, endpoint ? (signedIn ? 'not_requested' : 'sign_in_required') : 'gateway_not_configured'), [request, signedIn]);
  const shown: TeacherResult = result ?? fallback;
  const contextLabels = useMemo(() => {
    const rows = validEvidence(request.evidence.records);
    return new Map(analyzeItems(rows).map((item, index) => [`context-${index + 1}`, item.position === undefined || !item.clef ? (tr ? 'Bir bağlam' : 'A context')
      : `${pitchName(pitchAt(item.position, item.clef, item.accidental ?? 0), locale, true)} (${item.clef === 'bass' ? (tr ? 'fa anahtarı' : 'bass clef') : (tr ? 'sol anahtarı' : 'treble clef')})`]));
  }, [request, tr, locale]);

  async function ask() {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setBusy(true);
    try {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const value = await requestTeacherFeedback({
        endpoint, accessToken: data.session?.access_token ?? null, apiKey: publishableKey, request,
        idempotencyKey: idempotencyKeyFor(session, module), signal: next.signal,
      });
      if (!next.signal.aborted) setResult(value as TeacherResult);
    } finally {
      if (!next.signal.aborted) setBusy(false);
    }
  }

  const mode = shown.mode as 'live' | 'mock' | 'deterministic';
  const badge = mode === 'live'
    ? (tr ? `Canlı · Meta · ${shown.provenance.modelId}` : `Live · Meta · ${shown.provenance.modelId}`)
    : mode === 'mock' ? (tr ? 'Test yanıtı · gerçek model değil' : 'Test answer · not a real model')
      : (tr ? 'AI kullanılmadı · ölçümden kurallarla' : 'No AI used · rules on measurements');
  const reason = shown.reason && shown.reason !== 'not_requested' ? pick(REASONS[shown.reason], tr ? 'AI yanıtı alınamadı.' : 'No AI answer was received.') : null;
  const summary = shown.evidenceSummary;
  const canAsk = Boolean(endpoint) && signedIn && summary.eligible && !(result && result.mode !== 'deterministic');
  const limitations = [...new Set([...(shown.result.limitations ?? []), ...(shown.limitations ?? [])])];

  return <aside className="ai-teacher" data-mode={mode} aria-label={tr ? 'NotaNota AI Öğretmen' : 'NotaNota AI Teacher'}>
    <div className="ai-teacher-top">
      <h2>{tr ? 'AI Öğretmen' : 'AI Teacher'}</h2>
      <span className={`ai-teacher-mode ai-teacher-mode--${mode}`}>{badge}</span>
    </div>

    {assessment && <p className="ai-teacher-measured">{tr
      ? `Bu oturumda ölçülen: ${assessment.correct} doğru, ${assessment.wrong} yanlış, ${assessment.unaidedAttempts} yardımsız cevap.`
      : `Measured this session: ${assessment.correct} correct, ${assessment.wrong} incorrect, ${assessment.unaidedAttempts} unaided answers.`}</p>}

    <div aria-live="polite" aria-busy={busy}>
      {reason && <p className="ai-teacher-reason">{reason}</p>}
      {mode !== 'deterministic' && <p className="ai-teacher-summary">{shown.result.summary}</p>}
      {mode === 'deterministic' && assessment && assessment.eligible && <p className="ai-teacher-summary">{assessment.explanation}</p>}
      {mode === 'deterministic' && assessment && !assessment.eligible && <p className="ai-teacher-summary">{tr ? 'Kişisel değerlendirme için yeterli yardımsız cevap yok. Bir tur daha çalışınca ölçüm netleşir.' : 'Not enough unaided answers for a personal assessment. Another round will make the measurement clearer.'}</p>}

      {mode !== 'deterministic' && shown.result.observations.length > 0 && <ul className="ai-teacher-observations">
        {shown.result.observations.map((item, index) => <li key={index}>
          <p>{item.text}</p>
          <p className="ai-teacher-evidence">{tr ? 'Dayandığı ölçüm: ' : 'Based on: '}{item.evidenceRefs.map((ref) => {
            const measurement = summary.measurements.find((m) => m.id === ref);
            return `${contextLabels.get(measurement?.context ?? '') ?? ref}: ${describeMeasurement(summary, ref, locale) ?? ref}`;
          }).join('; ')}</p>
        </li>)}
      </ul>}

      {mode === 'deterministic' && assessment && assessment.weaknesses.length > 0 && <ul className="ai-teacher-observations">
        {assessment.weaknesses.map((item) => <li key={item.id}><p>{item.label}</p><p className="ai-teacher-evidence">{tr ? `${item.attempts} yardımsız denemede ${item.errors} hata` : `${item.errors} errors in ${item.attempts} unaided attempts`}</p></li>)}
      </ul>}

      <div className="ai-teacher-actions">
        {((mode !== 'deterministic' && shown.result.exercises.length > 0) || (assessment?.weaknesses.length ?? 0) > 0) && onPractiseWeak
          ? <button type="button" className="primary-button" onClick={onPractiseWeak}>{tr ? 'Önerilen tekrarı başlat' : 'Start the suggested review'}</button>
          : <button type="button" className="primary-button" onClick={onRepeat}>{tr ? 'Bir tur daha çalış' : 'Practise another round'}</button>}
        <button type="button" className="secondary-button" onClick={onProgress}>{tr ? 'Beceri haritası' : 'Skill map'}</button>
        {canAsk && <button type="button" className="secondary-button" disabled={busy} onClick={ask}>{busy ? (tr ? 'AI yanıtı bekleniyor…' : 'Waiting for the AI…') : (tr ? 'AI Öğretmen\'e yorumlat' : 'Ask the AI Teacher')}</button>}
      </div>

      {limitations.length > 0 && <details className="ai-teacher-limits">
        <summary>{tr ? 'Neyi ölçmedik' : 'What was not measured'}</summary>
        <ul>{limitations.map((item) => <li key={item}>{pick(LIMITS[item], item)}</li>)}</ul>
      </details>}
    </div>
  </aside>;
}
