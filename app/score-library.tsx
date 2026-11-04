"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { communityConfigured, supabase } from "@/lib/supabase";
import { checkUpload, staffLineScore } from "@/lib/upload-check.mjs";
import { readMusicXml } from "@/lib/musicxml.mjs";
import { checkScore, applyCorrections } from "@/lib/score-check.mjs";
import { createScore, uploadSource, listMyScores, getScore, saveCorrection, submitForReview, requestRecognition, deleteScore,
  listLibrary, openLibraryScore, reportError, scoreErrorCode, SCORE_LICENSES } from "@/lib/score-library.mjs";
import { openPages, canvasGray, contactSheet, sha256Hex, type PageSource } from "@/lib/pdf-pages";
import { buildScoreScreenRequest, requestScoreScreen } from "@/lib/ai-client.mjs";
import { liveTeacherConfigured, teacherApiKey, teacherEndpoint } from "./ai-teacher";
import { readMxl } from "@/lib/mxl";
import { ScoreView } from "./score-workspace";
import "./score-library.css";

type Locale = "tr" | "en";
type Score = Awaited<ReturnType<typeof listMyScores>>[number];
type Opened = { xml: string; title: string };
type LibraryRow = { scoreId: string; title: string; composer: string | null; instrument: string | null; difficulty: string | null; license: string; sourceNote: string | null };

/** On only where the score tables exist (the staging build); elsewhere nothing here is shown. */
export const scoreLibraryEnabled = communityConfigured && import.meta.env.VITE_SCORE_LIBRARY === "true";

const STATUS: Record<string, [string, string]> = {
  processing: ["Tanınıyor", "Being read"],
  needs_correction: ["Kontrol bekliyor", "Needs checking"],
  ready_personal: ["Kişisel kullanıma hazır", "Ready for you"],
  pending_review: ["İncelemede", "Under review"],
  published: ["Ortak kütüphanede", "In the shared library"],
  rejected: ["Yayına alınmadı", "Not published"],
};
const LICENSE: Record<string, [string, string]> = {
  public_domain: ["Kamu malı (telif süresi dolmuş)", "Public domain"],
  cc_by: ["Creative Commons BY", "Creative Commons BY"],
  cc_by_sa: ["Creative Commons BY-SA", "Creative Commons BY-SA"],
  own_work: ["Kendi bestem / düzenlemem", "My own composition or arrangement"],
  permission: ["Hak sahibinden yazılı izin var", "Written permission from the rights holder"],
  unknown: ["Bilmiyorum", "I don't know"],
};
const INSTRUMENTS = ["piano", "guitar", "violin", "voice", "flute", "other"] as const;
const INSTRUMENT: Record<string, [string, string]> = { piano: ["Piyano", "Piano"], guitar: ["Gitar", "Guitar"], violin: ["Keman", "Violin"], voice: ["Ses", "Voice"], flute: ["Flüt", "Flute"], other: ["Diğer", "Other"] };
const LEVELS: Record<string, [string, string]> = { beginner: ["Başlangıç", "Beginner"], intermediate: ["Orta", "Intermediate"], advanced: ["İleri", "Advanced"] };
const JOB_ERRORS: Record<string, [string, string]> = {
  engine_timeout: ["Tanıma çok uzun sürdü.", "Recognition took too long."],
  engine_failed: ["Tanıma motoru sayfayı okuyamadı.", "The recognition engine could not read the page."],
  download_failed: ["Dosya tanıma sunucusuna ulaşmadı.", "The file did not reach the recognition server."],
  no_output: ["Tanıma sonuç üretmedi.", "Recognition produced no result."],
  page_parts_mismatch: ["Sayfaların parti sayısı uyuşmuyor.", "The pages have different numbers of parts."],
  lease_expired: ["Tanıma yarıda kaldı.", "Recognition stopped halfway."],
};
const NAMES = { tr: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"], en: ["C", "D", "E", "F", "G", "A", "B"] } as const;
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const TYPES = ["whole", "half", "quarter", "eighth", "16th"] as const;
const TYPE_LABEL: Record<string, [string, string]> = { whole: ["Birlik", "Whole"], half: ["İkilik", "Half"], quarter: ["Dörtlük", "Quarter"], eighth: ["Sekizlik", "Eighth"], "16th": ["On altılık", "16th"] };

function useUser() {
  const [user, setUser] = useState<string | null | undefined>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setUser(data.session?.user.id ?? null); }).catch(() => alive && setUser(null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user.id ?? null));
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  return user;
}

/**
 * "My scores" and the shared library, inside score practice. A score is saved to the account (so it is
 * there on any device); the shared library only shows scores an administrator approved.
 */
export function ScoreShelf({ locale, onOpen }: { locale: Locale; onOpen: (opened: Opened) => void }) {
  const tr = locale === "tr";
  const user = useUser();
  const [tab, setTab] = useState<"mine" | "library" | "review">("mine");
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!user || !supabase) return;
    let alive = true;
    supabase.rpc("is_app_admin").then(({ data }) => { if (alive) setAdmin(data === true); }, () => undefined);
    return () => { alive = false; };
  }, [user]);
  const [adding, setAdding] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  if (!scoreLibraryEnabled || !supabase) return null;
  return (
    <section className="shelf" aria-labelledby="shelf-title">
      <div className="shelf-head">
        <h2 id="shelf-title">{tr ? "Eserler" : "Pieces"}</h2>
        <div className="shelf-tabs" role="tablist" aria-label={tr ? "Eser alanları" : "Piece areas"}>
          {([...(["mine", "library"] as const), ...(admin && user ? (["review"] as const) : [])]).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setAdding(false); setReviewing(null); }}>
              {id === "mine" ? (tr ? "Eserlerim" : "My scores") : id === "library" ? (tr ? "Ortak kütüphane" : "Shared library") : (tr ? "İnceleme" : "Review")}
            </button>
          ))}
        </div>
        {tab === "mine" && user && !adding && !reviewing && <button type="button" className="primary-button" onClick={() => setAdding(true)}>{tr ? "Dosyadan eser ekle" : "Add a score from a file"}</button>}
      </div>
      {tab === "mine" && user === null && <p className="shelf-note">{tr ? "Yüklediğin eserler hesabına kaydedilir; görmek ve eklemek için giriş yap." : "Your uploaded scores are saved to your account; sign in to see and add them."}</p>}
      {tab === "mine" && user && adding && <ScoreUpload locale={locale} onDone={(id) => { setAdding(false); if (id) setReviewing(id); }} />}
      {tab === "mine" && user && reviewing && <ScoreReview locale={locale} scoreId={reviewing} onClose={() => setReviewing(null)} onOpen={onOpen} />}
      {tab === "mine" && user && !adding && !reviewing && <MyScores locale={locale} onReview={setReviewing} onOpen={onOpen} />}
      {tab === "library" && <Library locale={locale} signedIn={Boolean(user)} onOpen={onOpen} />}
      {tab === "review" && admin && user && <ReviewQueue locale={locale} />}
    </section>
  );
}

function errorText(error: unknown, tr: boolean) {
  const code = scoreErrorCode(error);
  const known: Record<string, [string, string]> = {
    authentication_required: ["Giriş yapman gerekiyor.", "You need to sign in."],
    not_found: ["Eser bulunamadı.", "The score was not found."],
    file_too_large: ["Dosya 20 MB sınırından büyük.", "The file is larger than 20 MB."],
    unsupported_type: ["Bu dosya türü desteklenmiyor.", "This file type is not supported."],
    rate_limited: ["Çok sık işlem yapıldı; biraz sonra tekrar dene.", "Too many actions; try again in a moment."],
  };
  return (known[code] ?? [`İşlem tamamlanamadı (${code}).`, `The action did not complete (${code}).`])[tr ? 0 : 1];
}

function MyScores({ locale, onReview, onOpen }: { locale: Locale; onReview: (id: string) => void; onOpen: (opened: Opened) => void }) {
  const tr = locale === "tr";
  const [scores, setScores] = useState<Score[] | null>(null);
  const [jobs, setJobs] = useState<Record<string, Awaited<ReturnType<typeof getScore>>["job"]>>({});
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const list = await listMyScores(supabase);
      setScores(list);
      const pending = list.filter((s) => s.status === "processing");
      const found = await Promise.all(pending.map(async (s) => [s.id, (await getScore(supabase, s.id)).job] as const));
      setJobs(Object.fromEntries(found));
      setError(null);
    } catch (caught) { setError(errorText(caught, tr)); }
  }, [tr]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // Recognition runs in the background; while a score is being read, its progress is looked up every few seconds.
  const waiting = scores?.some((s) => s.status === "processing");
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 6000);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  async function act(run: () => Promise<unknown>) {
    try { await run(); await load(); } catch (caught) { setError(errorText(caught, tr)); }
  }
  async function practise(score: Score) {
    try { const full = await getScore(supabase, score.id); if (full.version?.musicxml) onOpen({ xml: full.version.musicxml, title: score.title }); }
    catch (caught) { setError(errorText(caught, tr)); }
  }

  if (scores === null) return <p className="shelf-note">{error ?? (tr ? "Eserlerin yükleniyor…" : "Loading your scores…")}</p>;
  return (
    <div className="shelf-list">
      {error && <p className="shelf-error" role="alert">{error}</p>}
      {scores.length === 0 && <p className="shelf-note">{tr ? "Henüz eser eklemedin" : "No scores yet"}</p>}
      {scores.map((score) => {
        const job = jobs[score.id];
        return (
          <article key={score.id} className="shelf-row">
            <div className="shelf-row-main">
              <h3>{score.title}{score.composer && <small> · {score.composer}</small>}</h3>
              <p>
                <span className={`shelf-status shelf-status--${score.status}`}>{STATUS[score.status]?.[tr ? 0 : 1] ?? score.status}</span>
                {score.status === "processing" && job && <span className="shelf-job">{job.state === "queued" ? (tr ? "Sırada bekliyor" : "Waiting in the queue")
                  : job.state === "running" ? (tr ? `Okunuyor · %${job.progress}` : `Reading · ${job.progress}%`)
                    : job.state === "failed" ? (JOB_ERRORS[job.errorCode ?? ""] ?? ["Tanıma başarısız oldu.", "Recognition failed."])[tr ? 0 : 1] : ""}</span>}
              </p>
            </div>
            <div className="shelf-row-actions">
              {score.status === "processing" && job?.state === "failed" && <button type="button" className="secondary-button" onClick={() => act(() => requestRecognition(supabase, score.id))}>{tr ? "Yeniden dene" : "Try again"}</button>}
              {["needs_correction", "ready_personal", "rejected"].includes(score.status) && <button type="button" className={score.status === "needs_correction" ? "primary-button" : "secondary-button"} onClick={() => onReview(score.id)}>{tr ? "Kontrol et ve düzelt" : "Check and correct"}</button>}
              {["ready_personal", "pending_review", "published"].includes(score.status) && <button type="button" className="primary-button" onClick={() => practise(score)}>{tr ? "Çalış" : "Practise"}</button>}
              {score.status === "ready_personal" && <button type="button" className="ghost-button" onClick={() => setSharing(sharing === score.id ? null : score.id)}>{tr ? "Ortak kütüphaneye öner" : "Suggest for the library"}</button>}
              {!["pending_review", "published"].includes(score.status) && <button type="button" className="ghost-button" onClick={() => { if (window.confirm(tr ? `"${score.title}" silinsin mi?` : `Delete "${score.title}"?`)) void act(() => deleteScore(supabase, score.id)); }}>{tr ? "Sil" : "Delete"}</button>}
            </div>
            {sharing === score.id && <ShareForm locale={locale} onCancel={() => setSharing(null)} onSubmit={(license, statement) => act(async () => { await submitForReview(supabase, { scoreId: score.id, license, shareStatement: statement }); setSharing(null); })} />}
          </article>
        );
      })}
    </div>
  );
}

function ShareForm({ locale, onSubmit, onCancel }: { locale: Locale; onSubmit: (license: string, statement: string) => void; onCancel: () => void }) {
  const tr = locale === "tr";
  const [license, setLicense] = useState("unknown");
  const [statement, setStatement] = useState("");
  const [sure, setSure] = useState(false);
  const ok = license !== "unknown" && statement.trim().length >= 10 && sure;
  return (
    <form className="shelf-share" onSubmit={(event) => { event.preventDefault(); if (ok) onSubmit(license, statement.trim()); }}>
      <p>{tr ? "Ortak kütüphanedeki eserleri herkes açabilir. Yayından önce bir yönetici doğruluğu, içeriği ve paylaşım hakkını inceler; senin \"doğru\" onayın tek başına yayın onayı değildir. Kaynak dosyan yayınlansa da herkese açılmaz, yalnız dijital nota paylaşılır." : "Anyone can open scores in the shared library. Before publication an administrator checks accuracy, content and the right to share; your own approval alone does not publish. Your source file is never made public; only the digital score is shared."}</p>
      <label>{tr ? "Bu notanın hakları" : "Rights to this score"}
        <select value={license} onChange={(e) => setLicense(e.target.value)}>{SCORE_LICENSES.map((id: string) => <option key={id} value={id}>{LICENSE[id]?.[tr ? 0 : 1] ?? id}</option>)}</select>
      </label>
      {license === "unknown" && <p className="shelf-note">{tr ? "Hakkını bilmediğin bir notayı herkese açamayız; kendi çalışman için Eserlerim'de kalır." : "We can't share a score whose rights you don't know; it stays in My scores for your own practice."}</p>}
      <label>{tr ? "Kaynak ve izin açıklaması" : "Source and permission"}
        <textarea value={statement} maxLength={500} rows={3} onChange={(e) => setStatement(e.target.value)} placeholder={tr ? "Örneğin: Mutopia Project #528, kamu malı; ya da: kendi düzenlemem." : "For example: Mutopia Project #528, public domain; or: my own arrangement."} />
      </label>
      <label className="shelf-check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />{tr ? "Bu notayı paylaşma hakkım olduğunu onaylıyorum." : "I confirm I have the right to share this score."}</label>
      <div className="shelf-actions"><button type="submit" className="primary-button" disabled={!ok}>{tr ? "İncelemeye gönder" : "Send for review"}</button><button type="button" className="ghost-button" onClick={onCancel}>{tr ? "Vazgeç" : "Cancel"}</button></div>
    </form>
  );
}

function Library({ locale, signedIn, onOpen }: { locale: Locale; signedIn: boolean; onOpen: (opened: Opened) => void }) {
  const tr = locale === "tr";
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<LibraryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      listLibrary(supabase, { search }).then((list) => { if (alive) { setRows(list); setError(null); } }).catch((caught) => alive && setError(errorText(caught, tr)));
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [search, tr]);
  return (
    <div className="shelf-list">
      <label className="shelf-search"><span className="sr-only">{tr ? "Eser ya da besteci ara" : "Search pieces or composers"}</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr ? "Eser ya da besteci ara" : "Search pieces or composers"} />
      </label>
      {error && <p className="shelf-error" role="alert">{error}</p>}
      {rows && rows.length === 0 && <p className="shelf-note">{tr ? "Ortak kütüphanede henüz onaylanmış eser yok." : "No approved scores in the shared library yet."}</p>}
      {rows?.map((row) => (
        <article key={row.scoreId} className="shelf-row">
          <div className="shelf-row-main">
            <h3>{row.title}{row.composer && <small> · {row.composer}</small>}</h3>
            <p className="shelf-meta">{[row.instrument && INSTRUMENT[row.instrument]?.[tr ? 0 : 1], row.difficulty && LEVELS[row.difficulty]?.[tr ? 0 : 1], LICENSE[row.license]?.[tr ? 0 : 1], row.sourceNote].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="shelf-row-actions">
            <button type="button" className="primary-button" onClick={async () => { try { const data = await openLibraryScore(supabase, row.scoreId); onOpen({ xml: data.musicxml, title: row.title }); } catch (caught) { setError(errorText(caught, tr)); } }}>{tr ? "Aç ve çalış" : "Open and practise"}</button>
            {signedIn && <button type="button" className="ghost-button" onClick={() => setReporting(reporting === row.scoreId ? null : row.scoreId)}>{tr ? "Hata bildir" : "Report an error"}</button>}
          </div>
          {sent === row.scoreId && <p className="shelf-note" role="status">{tr ? "Bildirimin alındı; düzeltme yeni bir sürüm olarak yayınlanır." : "Thanks; a fix is published as a new version."}</p>}
          {reporting === row.scoreId && <ReportForm locale={locale} onCancel={() => setReporting(null)} onSubmit={async (measure, message) => {
            try { await reportError(supabase, { scoreId: row.scoreId, measure, message }); setReporting(null); setSent(row.scoreId); } catch (caught) { setError(errorText(caught, tr)); }
          }} />}
        </article>
      ))}
    </div>
  );
}

function ReportForm({ locale, onSubmit, onCancel }: { locale: Locale; onSubmit: (measure: number, message: string) => void; onCancel: () => void }) {
  const tr = locale === "tr";
  const [measure, setMeasure] = useState(1);
  const [message, setMessage] = useState("");
  return (
    <form className="shelf-share" onSubmit={(event) => { event.preventDefault(); if (message.trim().length >= 5) onSubmit(measure, message.trim()); }}>
      <label>{tr ? "Ölçü" : "Bar"}<input type="number" min={1} max={2000} value={measure} onChange={(e) => setMeasure(Math.max(1, Number(e.target.value) || 1))} /></label>
      <label>{tr ? "Ne yanlış?" : "What is wrong?"}<textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      <div className="shelf-actions"><button type="submit" className="primary-button" disabled={message.trim().length < 5}>{tr ? "Gönder" : "Send"}</button><button type="button" className="ghost-button" onClick={onCancel}>{tr ? "Vazgeç" : "Cancel"}</button></div>
    </form>
  );
}

/**
 * Administrators only (the database checks it again): scores waiting for the shared library. Approval needs
 * all three checks; a rejection needs a reason the owner will see.
 */
function ReviewQueue({ locale }: { locale: Locale }) {
  const tr = locale === "tr";
  type Pending = { id: string; title: string; composer: string | null; license: string; share_statement: string | null; source_note: string | null; current_version_id: string };
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [open, setOpen] = useState<{ id: string; xml: string } | null>(null);
  const [checks, setChecks] = useState({ accuracy: false, content: false, rights: false });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error: failed } = await supabase!.from("scores").select("id,title,composer,license,share_statement,source_note,current_version_id").eq("status", "pending_review").order("submitted_at");
    if (failed) setError(errorText(failed, tr)); else setRows((data ?? []) as Pending[]);
  }, [tr]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function show(row: Pending) {
    const { data } = await supabase!.from("score_versions").select("musicxml").eq("id", row.current_version_id).maybeSingle();
    setOpen(data?.musicxml ? { id: row.id, xml: data.musicxml } : null);
    setChecks({ accuracy: false, content: false, rights: false }); setReason("");
  }
  async function decide(id: string, decision: "approve" | "reject") {
    const { error: failed } = await supabase!.rpc("score_review", { p_score_id: id, p_decision: decision, p_reason: reason.trim() || null, p_checks: checks });
    if (failed) { setError(errorText(failed, tr)); return; }
    setOpen(null); setError(null); await load();
  }
  if (!rows) return <p className="shelf-note">{error ?? (tr ? "Yükleniyor…" : "Loading…")}</p>;
  return (
    <div className="shelf-list">
      {error && <p className="shelf-error" role="alert">{error}</p>}
      {rows.length === 0 && <p className="shelf-note">{tr ? "İnceleme bekleyen eser yok." : "Nothing is waiting for review."}</p>}
      {rows.map((row) => (
        <article key={row.id} className="shelf-row">
          <div className="shelf-row-main">
            <h3>{row.title}{row.composer && <small> · {row.composer}</small>}</h3>
            <p className="shelf-meta">{LICENSE[row.license]?.[tr ? 0 : 1] ?? row.license}{row.source_note ? ` · ${row.source_note}` : ""}</p>
            {row.share_statement && <p className="shelf-meta">“{row.share_statement}”</p>}
          </div>
          <div className="shelf-row-actions"><button type="button" className="secondary-button" onClick={() => (open?.id === row.id ? setOpen(null) : void show(row))}>{open?.id === row.id ? (tr ? "Kapat" : "Close") : (tr ? "İncele" : "Review")}</button></div>
          {open?.id === row.id && (
            <div className="shelf-share">
              <div className="shelf-review-score"><ScoreView xml={open.xml} label={tr ? "İncelenen sürüm" : "Version under review"} failLabel={tr ? "Nota çizilemedi." : "The score could not be drawn."} /></div>
              {([["accuracy", ["Notalar kaynakla karşılaştırıldı, doğru", "Notes compared with the source and correct"]], ["content", ["İçerik uygun", "Content is appropriate"]], ["rights", ["Paylaşım hakkı ve lisans yeterli", "Right to share and licence are sufficient"]]] as const).map(([key, label]) => (
                <label key={key} className="shelf-check"><input type="checkbox" checked={checks[key]} onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })} />{label[tr ? 0 : 1]}</label>
              ))}
              <label>{tr ? "Not (ret için zorunlu, eser sahibine gösterilir)" : "Note (required to reject; shown to the owner)"}<textarea rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <div className="shelf-actions">
                <button type="button" className="primary-button" disabled={!checks.accuracy || !checks.content || !checks.rights} onClick={() => decide(row.id, "approve")}>{tr ? "Onayla ve yayınla" : "Approve and publish"}</button>
                <button type="button" className="secondary-button" disabled={!reason.trim()} onClick={() => decide(row.id, "reject")}>{tr ? "Reddet" : "Reject"}</button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/* ---------- Upload: choose → check → read → (save) ---------- */

type PageCheck = { verdict: "score" | "unclear" | "not_score"; staves: number };
type Screen = { verdict: "score" | "not_score" | "unclear"; inappropriate: boolean; category: string; handwriting: "none" | "light" | "covers_notes"; notes: string };
/** Pages per content check and the most pages a file may have when it is checked. */
const SHEET_PAGES = 8, SCREEN_MAX_PAGES = 16;

/**
 * Meta looks at the whole file (every page, as thumbnails on one or two sheets) before anything is saved:
 * is it music, is anything inappropriate, do scribbles hide notes. Text in the file is data for it, never
 * instructions. It is a model's judgement, not a guarantee; an unavailable check never blocks a personal
 * upload, and nothing reaches the shared library without an administrator.
 */
async function screenFile(source: PageSource, locale: Locale): Promise<{ state: "done"; results: Screen[] } | { state: "unavailable"; reason: string } | { state: "too_many" }> {
  if (!liveTeacherConfigured || !supabase) return { state: "unavailable", reason: "gateway_not_configured" };
  if (source.pageCount > SCREEN_MAX_PAGES) return { state: "too_many" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  const all = Array.from({ length: source.pageCount }, (_, i) => i);
  const results: Screen[] = [];
  for (let start = 0; start < all.length; start += SHEET_PAGES) {
    const pages = all.slice(start, start + SHEET_PAGES);
    const sheet = await contactSheet(source, pages);
    const request = buildScoreScreenRequest({ locale, data: sheet.data, width: sheet.width, height: sheet.height, pages: pages.length });
    const value = await requestScoreScreen({ endpoint: teacherEndpoint, accessToken: token, apiKey: teacherApiKey, request });
    // A later sheet failing must not hide what an earlier one found: inappropriate content still stops the upload.
    if (!value.ok) return results.some((r) => r.inappropriate) ? { state: "done", results } : { state: "unavailable", reason: value.reason ?? "unavailable" };
    results.push(value.result as Screen);
  }
  return { state: "done", results };
}
type Picked =
  | { kind: "xml"; name: string; bytes: Uint8Array; xml: string; title: string | null; composer: string | null }
  | { kind: "pages"; name: string; bytes: Uint8Array; type: "pdf" | "png" | "jpeg"; mime: string; source: PageSource; thumbs: string[]; selected: number[]; checks: Record<number, PageCheck> };

const MAX_SELECTED = 8;

function ScoreUpload({ locale, onDone }: { locale: Locale; onDone: (scoreId: string | null) => void }) {
  const tr = locale === "tr";
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [meta, setMeta] = useState({ title: "", composer: "", instrument: "", difficulty: "", sourceNote: "" });
  const [notice, setNotice] = useState<string | null>(null);
  const [screened, setScreened] = useState(false);
  useEffect(() => () => { if (picked?.kind === "pages") picked.source.close(); }, [picked]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null); setChecked(false); setNotice(null); setPicked(null);
    setBusy(tr ? "Dosya kontrol ediliyor…" : "Checking the file…");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkUpload(bytes, file.name);
      if (!check.ok) { setError(check.message?.[locale] ?? (tr ? "Dosya kabul edilmedi." : "The file was not accepted.")); return; }
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120);
      if (check.type === "musicxml" || check.type === "mxl") {
        const xml = check.type === "mxl" ? await readMxl(bytes) : new TextDecoder().decode(bytes);
        const score = readMusicXml(xml);
        setPicked({ kind: "xml", name: file.name, bytes, xml, title: score.title, composer: score.composer });
        setMeta((m) => ({ ...m, title: score.title ?? base, composer: score.composer ?? "" }));
        setChecked(true);
        return;
      }
      const type = check.type as "pdf" | "png" | "jpeg";
      const source = await openPages(bytes, type);
      const thumbs: string[] = [];
      for (let i = 0; i < source.pageCount; i++) thumbs.push((await source.render(i, 220)).toDataURL("image/jpeg", 0.8));
      setPicked({ kind: "pages", name: file.name, bytes, type, mime: check.mime!, source, thumbs, selected: thumbs.map((_, i) => i).slice(0, Math.min(4, thumbs.length)), checks: {} });
      setMeta((m) => ({ ...m, title: base }));
    } catch (caught) {
      const code = (caught as { code?: string; message?: string })?.code ?? (caught as Error)?.message;
      setError(code === "encrypted" ? (tr ? "PDF parola korumalı. Korumasız bir kopya yükle." : "The PDF is password-protected. Upload an unprotected copy.")
        : code === "too_many_pages" ? (tr ? "PDF en fazla 30 sayfa olabilir." : "A PDF can have at most 30 pages.")
          : (tr ? "Dosya açılamadı. Bozuk ya da desteklenmeyen bir dosya olabilir." : "The file could not be opened. It may be damaged or unsupported."));
    } finally { setBusy(null); }
  }

  // Each chosen page is drawn and searched for staves before anything is uploaded. Pages without a single
  // staff are left out; if no page has one, the file is refused. Unclear pages go on, marked for review.
  async function checkPages() {
    if (picked?.kind !== "pages") return;
    setBusy(tr ? "Sayfalarda porte aranıyor…" : "Looking for staves on the pages…");
    setError(null);
    try {
      const checks: Record<number, PageCheck> = {};
      for (const index of picked.selected) {
        const canvas = await picked.source.render(index, 1600);
        const { gray, width, height } = canvasGray(canvas);
        const result = staffLineScore(gray, width, height);
        checks[index] = { verdict: result.verdict, staves: result.staves.length };
      }
      const usable = picked.selected.filter((i) => checks[i].verdict !== "not_score");
      setPicked({ ...picked, checks, selected: usable });
      if (!usable.length) { setError(tr ? "Bu dosyada okunabilir bir partisyon bulamadık. Porte çizgilerinin net göründüğü bir tarama ya da fotoğraf yükle." : "We couldn't find a readable score in this file. Upload a scan or photo where the staff lines are clear."); return; }
      const dropped = picked.selected.length - usable.length;
      const unclear = usable.filter((i) => checks[i].verdict === "unclear").length;
      setBusy(tr ? "Dosyanın içeriği kontrol ediliyor…" : "Checking what the file contains…");
      const screen = await screenFile(picked.source, locale);
      if (screen.state === "too_many") { setError(tr ? `İçerik kontrolü en fazla ${SCREEN_MAX_PAGES} sayfalık dosyalarda yapılabiliyor. Çalışmak istediğin sayfaları ayrı bir PDF olarak kaydedip onu yükle.` : `The content check works on files of up to ${SCREEN_MAX_PAGES} pages. Save the pages you want to practise as a separate PDF and upload that.`); return; }
      const results = screen.state === "done" ? screen.results : [];
      // Inappropriate content anywhere in the file stops the upload; nothing is saved or sent on.
      if (results.some((r) => r.inappropriate)) { setPicked(null); setError(tr ? "Bu dosyada uygunsuz olabilecek bir içerik görüldüğü için yüklemeyi durdurduk; dosya kaydedilmedi. Yalnız partisyon sayfalarını içeren bir dosya yükleyebilirsin." : "We stopped the upload because the file may contain inappropriate content; it was not saved. You can upload a file with only the score pages."); return; }
      if (results.length && results.every((r) => r.verdict === "not_score") && unclear === usable.length) { setError(tr ? "Bu dosyada okunabilir bir partisyon bulamadık. Porte çizgilerinin net göründüğü bir tarama ya da fotoğraf yükle." : "We couldn't find a readable score in this file. Upload a scan or photo where the staff lines are clear."); return; }
      setNotice([
        dropped ? (tr ? `${dropped} sayfada porte bulunamadı; bu sayfalar çıkarıldı.` : `No staff was found on ${dropped} page(s); they were left out.`) : "",
        unclear ? (tr ? `${unclear} sayfada porte net değil; tanımadan sonra işaretlenen yerleri dikkatle kontrol et.` : `Staves are unclear on ${unclear} page(s); check the flagged places carefully after reading.`) : "",
        results.some((r) => r.handwriting === "covers_notes") ? (tr ? "Bazı karalamalar notaları kapatıyor olabilir. Kapalı yerleri tahmin etmiyoruz: daha net bir görüntü yükle ya da tanımadan sonra o yerleri düzelt." : "Some scribbles may hide notes. We don't guess hidden notes: upload a clearer image or correct those places after reading.") : "",
        results.some((r) => r.verdict === "unclear") ? (tr ? "İçerik kontrolü bazı sayfalardan emin olamadı; eser yalnız senin hesabında kalır ve ortak kütüphane için incelemeden geçer." : "The content check was unsure about some pages; the score stays in your account and goes through review for the library.") : "",
        screen.state === "unavailable" ? (tr ? "İçerik kontrolü şu an yapılamadı; eser yalnız senin hesabında kalır ve yönetici incelemesi olmadan ortak kütüphaneye çıkmaz." : "The content check is not available right now; the score stays in your account and never reaches the library without an administrator's review.") : "",
      ].filter(Boolean).join(" ") || null);
      setScreened(screen.state === "done");
      setChecked(true);
    } catch { setError(tr ? "Sayfa çizilemedi." : "The page could not be drawn."); } finally { setBusy(null); }
  }

  async function save() {
    if (!picked || !meta.title.trim()) return;
    setBusy(tr ? "Hesabına kaydediliyor…" : "Saving to your account…");
    setError(null);
    try {
      const common = { title: meta.title.trim(), composer: meta.composer.trim() || null, instrument: meta.instrument || null, difficulty: meta.difficulty || null, sourceNote: meta.sourceNote.trim() || null };
      if (picked.kind === "xml") {
        const created = await createScore(supabase, { ...common, musicxml: picked.xml });
        if (created.duplicate) setNotice(tr ? "Bu eser zaten Eserlerim'de; mevcut kaydı açıyoruz." : "This score is already in My scores; opening that one.");
        onDone(created.scoreId);
        return;
      }
      const hash = await sha256Hex(picked.bytes);
      const created = await createScore(supabase, { ...common, sourceHash: hash });
      if (!created.duplicate) {
        await uploadSource(supabase, { scoreId: created.scoreId, sourceHash: hash, file: new Blob([picked.bytes.slice()], { type: picked.mime }), mime: picked.mime,
          bytes: picked.bytes.length, pageCount: picked.source.pageCount, selectedPages: picked.selected.map((i) => i + 1).sort((a, b) => a - b) });
      }
      onDone(null);
    } catch (caught) { setError(errorText(caught, tr)); } finally { setBusy(null); }
  }

  const steps = tr ? ["Dosya", "Sayfalar ve kontrol", "Bilgiler"] : ["File", "Pages and check", "Details"];
  const step = !picked ? 0 : !checked ? 1 : 2;
  return (
    <div className="shelf-upload">
      <ol className="shelf-steps">{steps.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined} className={i < step ? "is-done" : ""}>{label}</li>)}</ol>
      {step === 0 && (
        <div className="shelf-pick">
          <label className="primary-button shelf-file">{tr ? "Dosya seç" : "Choose a file"}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.musicxml,.xml,.mxl,application/pdf,image/png,image/jpeg" onChange={choose} />
          </label>
          <p className="shelf-note">{tr ? "PDF, PNG, JPEG ya da MusicXML · en fazla 20 MB" : "PDF, PNG, JPEG or MusicXML · up to 20 MB"}</p>
        </div>
      )}
      {picked?.kind === "pages" && !checked && (
        <div className="shelf-pages">
          <p>{tr ? `Hangi sayfaları okuyalım? (en fazla ${MAX_SELECTED})` : `Which pages should we read? (up to ${MAX_SELECTED})`}</p>
          <div className="shelf-thumbs">
            {picked.thumbs.map((src, i) => {
              const on = picked.selected.includes(i);
              return (
                <label key={i} className={`shelf-thumb${on ? " is-on" : ""}`}>
                  <input type="checkbox" checked={on} disabled={!on && picked.selected.length >= MAX_SELECTED}
                    onChange={() => setPicked({ ...picked, selected: on ? picked.selected.filter((s) => s !== i) : [...picked.selected, i].sort((a, b) => a - b) })} />
                  {/* eslint-disable-next-line @next/next/no-img-element -- a page drawn on this device, not a remote asset */}
                  <img src={src} alt={tr ? `Sayfa ${i + 1}` : `Page ${i + 1}`} />
                  <span>{i + 1}</span>
                </label>
              );
            })}
          </div>
          <div className="shelf-actions">
            <button type="button" className="primary-button" disabled={!picked.selected.length || Boolean(busy)} onClick={checkPages}>{tr ? "Sayfaları kontrol et" : "Check the pages"}</button>
            <button type="button" className="ghost-button" onClick={() => { setPicked(null); setError(null); }}>{tr ? "Başka dosya" : "Another file"}</button>
          </div>
        </div>
      )}
      {picked && checked && (
        <form className="shelf-meta-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {picked.kind === "pages" && <p className="shelf-note">{tr ? `${picked.selected.length} sayfa okunacak: ${picked.selected.map((i) => i + 1).join(", ")}.` : `${picked.selected.length} page(s) will be read: ${picked.selected.map((i) => i + 1).join(", ")}.`}</p>}
          {picked.kind === "xml" && <p className="shelf-note">{tr ? "MusicXML doğrudan okunur; sayfa tanıma gerekmez." : "MusicXML is read directly; no page recognition is needed."}</p>}
          <label>{tr ? "Eser adı" : "Title"}<input required maxLength={160} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></label>
          <label>{tr ? "Besteci" : "Composer"}<input maxLength={120} value={meta.composer} onChange={(e) => setMeta({ ...meta, composer: e.target.value })} /></label>
          <label>{tr ? "Enstrüman" : "Instrument"}<select value={meta.instrument} onChange={(e) => setMeta({ ...meta, instrument: e.target.value })}><option value="">–</option>{INSTRUMENTS.map((id) => <option key={id} value={id}>{INSTRUMENT[id][tr ? 0 : 1]}</option>)}</select></label>
          <label>{tr ? "Zorluk" : "Difficulty"}<select value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: e.target.value })}><option value="">–</option>{Object.keys(LEVELS).map((id) => <option key={id} value={id}>{LEVELS[id][tr ? 0 : 1]}</option>)}</select></label>
          <label className="shelf-wide">{tr ? "Kaynak (isteğe bağlı)" : "Source (optional)"}<input maxLength={200} value={meta.sourceNote} onChange={(e) => setMeta({ ...meta, sourceNote: e.target.value })} placeholder={tr ? "Örneğin: Mutopia #528 ya da öğretmenimin fotokopisi" : "For example: Mutopia #528 or my teacher's copy"} /></label>
          <p className="shelf-note shelf-wide">{screened
            ? (tr ? "Dosyanın tamamı içerik kontrolünden geçti. Eser yalnız senin hesabına kaydedilir; ortak kütüphaneye yönetici incelemesi olmadan çıkmaz. Otomatik kontrol bir model yargısıdır, kesin güvence değildir." : "The whole file passed the content check. The score is saved to your account only and never reaches the library without an administrator's review. The automatic check is a model's judgement, not a guarantee.")
            : (tr ? "Eser yalnız senin hesabına kaydedilir; hiçbir eser yönetici incelemesi olmadan ortak kütüphaneye çıkmaz." : "The score is saved to your account only; no score reaches the shared library without an administrator's review.")}</p>
          <div className="shelf-actions shelf-wide">
            <button type="submit" className="primary-button" disabled={!meta.title.trim() || Boolean(busy)}>{picked.kind === "xml" ? (tr ? "Kaydet ve kontrol et" : "Save and check") : (tr ? "Kaydet ve tanımayı başlat" : "Save and start reading")}</button>
            <button type="button" className="ghost-button" onClick={() => onDone(null)}>{tr ? "Vazgeç" : "Cancel"}</button>
          </div>
        </form>
      )}
      {busy && <p className="shelf-note" role="status">{busy}</p>}
      {notice && <p className="shelf-note" role="status">{notice}</p>}
      {error && <p className="shelf-error" role="alert">{error}</p>}
      {step === 0 && <button type="button" className="ghost-button" onClick={() => onDone(null)}>{tr ? "Vazgeç" : "Cancel"}</button>}
    </div>
  );
}

/* ---------- Review: the recognized score, flagged places, corrections ---------- */

type Issue = { code: string; severity: string; measure: number | string; staff?: number; voice?: string; noteIndex?: number; message: { tr: string; en: string } };
type Correction = { measureIndex: number; measure: number | string; staff: number; voice: string; noteIndex: number; set: Record<string, unknown> };

function ScoreReview({ locale, scoreId, onClose, onOpen }: { locale: Locale; scoreId: string; onClose: () => void; onOpen: (opened: Opened) => void }) {
  const tr = locale === "tr";
  const [score, setScore] = useState<Awaited<ReturnType<typeof getScore>> | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [measure, setMeasure] = useState<number>(0);
  const [note, setNote] = useState<number>(0);
  const [edit, setEdit] = useState<{ step: string; octave: number; alter: number; type: string }>({ step: "C", octave: 4, alter: 0, type: "quarter" });
  const original = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    getScore(supabase, scoreId).then((full) => {
      if (!alive) return;
      setScore(full); setXml(full.version?.musicxml ?? null); original.current = full.version?.musicxml ?? null;
      try {
        const first = full.version?.musicxml ? readMusicXml(full.version.musicxml).parts[0]?.measures[0]?.raw.find((e) => e.kind === "note") : null;
        if (first) setEdit((current) => ({ ...current, step: first.step ?? "C", octave: first.octave ?? 4, alter: first.alter ?? 0 }));
      } catch { /* the checks below report an unreadable file */ }
    })
      .catch((caught) => alive && setError(errorText(caught, tr)));
    return () => { alive = false; };
  }, [scoreId, tr]);

  const parsed = useMemo(() => { try { return xml ? readMusicXml(xml) : null; } catch { return null; } }, [xml]);
  const issues: Issue[] = useMemo(() => { try { return xml ? (checkScore(xml).issues as Issue[]) : []; } catch { return []; } }, [xml]);
  const engineWarnings = (score?.version?.warnings ?? []) as { code: string }[];
  const part = parsed?.parts[0];
  const notes = part?.measures[measure]?.raw.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.kind === "note") ?? [];
  const chosen = notes.find((n) => n.index === note) ?? notes[0];
  const flagged = new Set(issues.map((issue) => String(issue.measure)));

  // Picking a note fills the editor with what was read for it.
  function select(measureIndex: number, rawIndex: number) {
    const list = part?.measures[measureIndex]?.raw ?? [];
    const target = list[rawIndex]?.kind === "note" ? list[rawIndex] : list.find((e) => e.kind === "note");
    setMeasure(measureIndex);
    setNote(target ? list.indexOf(target) : -1);
    if (target) setEdit((current) => ({ ...current, step: target.step ?? "C", octave: target.octave ?? 4, alter: target.alter ?? 0 }));
  }

  function apply() {
    if (!xml || !part || !chosen) return;
    // The same address the checks use: position among this staff and voice's notes and rests in the bar.
    const raw = part.measures[measure].raw;
    const noteIndex = raw.slice(0, chosen.index).filter((e) => e.staff === chosen.entry.staff && e.voice === chosen.entry.voice).length;
    const correction: Correction = { measureIndex: measure, measure: part.measures[measure].number, staff: chosen.entry.staff, voice: chosen.entry.voice, noteIndex, set: { step: edit.step, octave: edit.octave, alter: edit.alter, duration: edit.type } };
    try {
      const next = applyCorrections(xml, [correction]);
      if (next.rejected.length) { setError(tr ? "Bu düzeltme uygulanamadı." : "This correction could not be applied."); return; }
      setXml(next.xml);
      setCorrections((list) => [...list, correction]);
      setSaved(null); setError(null);
    } catch { setError(tr ? "Bu düzeltme uygulanamadı." : "This correction could not be applied."); }
  }
  async function store(confirm: boolean) {
    if (!xml) return;
    try {
      await saveCorrection(supabase, { scoreId, musicxml: xml, corrections, warnings: issues.map(({ code, measure: m }) => ({ code, measure: m })), confirm });
      setSaved(confirm ? (tr ? "Kaydedildi. Artık bu eseri çalışabilirsin." : "Saved. You can practise this score now.") : (tr ? "Taslak kaydedildi." : "Draft saved."));
      if (confirm) setScore((s) => (s ? { ...s, status: "ready_personal" } : s));
    } catch (caught) { setError(errorText(caught, tr)); }
  }

  if (!score) return <p className="shelf-note">{error ?? (tr ? "Eser açılıyor…" : "Opening the score…")}</p>;
  if (!xml) return <div className="shelf-review"><p className="shelf-note">{tr ? "Bu eserin henüz okunmuş bir sonucu yok." : "This score has no reading yet."}</p><button type="button" className="ghost-button" onClick={onClose}>{tr ? "Geri" : "Back"}</button></div>;
  const names = NAMES[locale];
  return (
    <div className="shelf-review">
      <div className="shelf-review-head">
        <h3>{score.title}</h3>
        <p className="shelf-warn">{tr ? "Tanıma sırasında hata oluşabilir. İşaretlenen yerleri kontrol et." : "Recognition can make mistakes. Check the flagged places."}</p>
        <p className="shelf-note">{score.version?.engine === "musicxml_import" ? (tr ? "Kaynak: MusicXML dosyası (tanıma yapılmadı)." : "Source: a MusicXML file (no recognition).") : (tr ? `Tanıma: ${score.version?.engine} ${score.version?.engineVersion ?? ""}. Motor güven puanı vermiyor; aşağıdaki işaretler müzikal tutarlılık denetiminden gelir.` : `Read by ${score.version?.engine} ${score.version?.engineVersion ?? ""}. The engine gives no confidence score; the flags below come from musical consistency checks.`)}</p>
      </div>
      <div className="shelf-review-body">
        <div className="shelf-review-score"><ScoreView xml={xml} label={tr ? "Dijital sonuç" : "Digital result"} failLabel={tr ? "Nota çizilemedi." : "The score could not be drawn."} /></div>
        <aside className="shelf-review-side">
          <h4>{tr ? `İşaretlenen yerler (${issues.length + engineWarnings.length})` : `Flagged places (${issues.length + engineWarnings.length})`}</h4>
          {issues.length + engineWarnings.length === 0 && <p className="shelf-note">{tr ? "Denetimler bir tutarsızlık bulmadı; yine de kaynakla karşılaştır." : "The checks found no inconsistency; still compare with the source."}</p>}
          <ul className="shelf-issues">
            {engineWarnings.map((w) => <li key={w.code} className="is-warn">{({ voices_not_separated: ["Bu motor sesleri ayırmıyor; çok sesli yerleri kontrol et.", "This engine does not separate voices; check places with several voices."], key_signature_may_be_missed: ["Donanım kaçırılmış olabilir: diyezleri ve bemolleri kontrol et.", "The key signature may have been missed: check sharps and flats."], tempo_marks_read_as_notes: ["Tempo işaretindeki nota, nota diye okunmuş olabilir (1. ölçü).", "A note in the tempo mark may have been read as a note (bar 1)."] } as Record<string, [string, string]>)[w.code]?.[tr ? 0 : 1] ?? w.code}</li>)}
            {issues.slice(0, 40).map((issue, i) => (
              <li key={i} className={`is-${issue.severity}`}><button type="button" onClick={() => { const index = part?.measures.findIndex((m) => String(m.number) === String(issue.measure)) ?? -1; if (index >= 0) select(index, -1); }}>
                {tr ? `${issue.measure}. ölçü` : `Bar ${issue.measure}`}</button> {issue.message[locale]}</li>
            ))}
          </ul>
          {part && (
            <div className="shelf-edit">
              <h4>{tr ? "Notayı düzelt" : "Correct a note"}</h4>
              <label>{tr ? "Ölçü" : "Bar"}<select value={measure} onChange={(e) => select(Number(e.target.value), -1)}>
                {part.measures.map((m, i) => <option key={i} value={i}>{m.number}{flagged.has(String(m.number)) ? " •" : ""}</option>)}</select></label>
              {notes.length > 0 ? <>
                <label>{tr ? "Nota" : "Note"}<select value={chosen?.index ?? 0} onChange={(e) => select(measure, Number(e.target.value))}>
                  {notes.map(({ entry, index }, n) => <option key={index} value={index}>{n + 1}. {names[STEPS.indexOf(entry.step ?? "C")]}{entry.alter === 1 ? "♯" : entry.alter === -1 ? "♭" : ""}{entry.octave} ({entry.beats})</option>)}</select></label>
                <div className="shelf-edit-grid">
                  <label>{tr ? "Ad" : "Name"}<select value={edit.step} onChange={(e) => setEdit({ ...edit, step: e.target.value })}>{STEPS.map((s, i) => <option key={s} value={s}>{names[i]}</option>)}</select></label>
                  <label>{tr ? "Oktav" : "Octave"}<input type="number" min={1} max={7} value={edit.octave} onChange={(e) => setEdit({ ...edit, octave: Math.min(7, Math.max(1, Number(e.target.value) || 4)) })} /></label>
                  <label>{tr ? "Arıza" : "Accidental"}<select value={edit.alter} onChange={(e) => setEdit({ ...edit, alter: Number(e.target.value) })}><option value={-1}>♭</option><option value={0}>♮ / –</option><option value={1}>♯</option></select></label>
                  <label>{tr ? "Süre" : "Duration"}<select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{TYPES.map((type) => <option key={type} value={type}>{TYPE_LABEL[type][tr ? 0 : 1]}</option>)}</select></label>
                </div>
                <button type="button" className="secondary-button" onClick={apply}>{tr ? "Düzeltmeyi uygula" : "Apply the correction"}</button>
              </> : <p className="shelf-note">{tr ? "Bu ölçüde nota yok." : "No notes in this bar."}</p>}
              <p className="shelf-note">{tr ? `${corrections.length} düzeltme. Tanıma sonucu ayrı saklanır; düzeltmelerin yeni bir sürüm olarak kaydedilir.` : `${corrections.length} correction(s). The recognition result is kept separately; your corrections are saved as a new version.`}</p>
              {corrections.length > 0 && <button type="button" className="ghost-button" onClick={() => { setXml(original.current); setCorrections([]); }}>{tr ? "Düzeltmeleri geri al" : "Undo the corrections"}</button>}
            </div>
          )}
        </aside>
      </div>
      {error && <p className="shelf-error" role="alert">{error}</p>}
      {saved && <p className="shelf-note" role="status">{saved}</p>}
      <div className="shelf-actions">
        <button type="button" className="primary-button" onClick={() => store(true)}>{tr ? "Kontrol ettim, kaydet" : "I've checked it, save"}</button>
        <button type="button" className="secondary-button" onClick={() => store(false)}>{tr ? "Taslak olarak kaydet" : "Save as draft"}</button>
        {score.status === "ready_personal" && <button type="button" className="secondary-button" onClick={() => onOpen({ xml, title: score.title })}>{tr ? "Bu eseri çalış" : "Practise this score"}</button>}
        <button type="button" className="ghost-button" onClick={onClose}>{tr ? "Eserlerime dön" : "Back to my scores"}</button>
      </div>
    </div>
  );
}
