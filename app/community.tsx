"use client";

import type { User } from "@supabase/supabase-js";
import {
  FormEvent,
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  claimUsername,
  getLeaderboard,
  getMyProfile,
  LeaderboardRow,
  PracticeLevel,
  Profile,
  QuestionMode,
  ScoreSubmission,
  SessionType,
  submitBestScore,
} from "@/lib/leaderboard";
import { communityConfigured, supabase } from "@/lib/supabase";

type Locale = "tr" | "en";
type Panel = "auth" | "account" | "leaderboard" | "legal" | "confirm" | null;
type AccountStatus = "saved" | "not_better" | "ineligible" | "backend_pending" | null;

const PENDING_SCORE_KEY = "nota-nota-pending-score";
const PENDING_SCORE_TTL_MS = 24 * 60 * 60 * 1000;

function rememberPendingScore(score: ScoreSubmission) {
  try {
    window.localStorage.setItem(PENDING_SCORE_KEY, JSON.stringify({ score, expiresAt: Date.now() + PENDING_SCORE_TTL_MS }));
  } catch {
    // Score saving still continues in the current tab when storage is unavailable.
  }
}

function readPendingScore(): ScoreSubmission | null {
  try {
    const pending = JSON.parse(window.localStorage.getItem(PENDING_SCORE_KEY) ?? "null") as { score?: ScoreSubmission; expiresAt?: number } | null;
    const score = pending?.score;
    const valid = Boolean(
      pending
      && typeof pending.expiresAt === "number"
      && pending.expiresAt > Date.now()
      && score
      && ["standard", "endless"].includes(score.sessionType)
      && ["temel", "yakin", "tam"].includes(score.level)
      && ["porte", "konum"].includes(score.questionMode)
      && [score.correctCount, score.wrongCount, score.totalResponseTimeMs].every((value) => Number.isFinite(value) && value >= 0),
    );
    if (!valid) {
      clearPendingScore();
      return null;
    }
    return score ?? null;
  } catch {
    clearPendingScore();
    return null;
  }
}

function clearPendingScore() {
  try {
    window.localStorage.removeItem(PENDING_SCORE_KEY);
  } catch {
    // Storage may be unavailable in private browsing modes.
  }
}

const TEXT = {
  tr: {
    leaderboard: "Sıralama",
    signIn: "Giriş yap",
    account: "Hesabım",
    close: "Kapat",
    emailTitle: "E-postayla giriş yap",
    emailCopy: "Sana tek kullanımlık bir doğrulama bağlantısı göndereceğiz. Şifre gerekmiyor.",
    email: "E-posta adresi",
    sendLink: "Doğrulama bağlantısı gönder",
    sendingLink: "Gönderiliyor…",
    privacyAssurance: "E-posta adresini satmayız ve reklam ya da pazarlama amacıyla paylaşmayız. Yalnızca güvenli giriş için hizmet sağlayıcılarımız tarafından işlenir.",
    linkSent: "Bağlantı gönderildi. Gelen kutunu kontrol et.",
    backendPending: "Topluluk özellikleri özel kurulum tamamlanınca açılacak.",
    usernameTitle: "Kullanıcı adını seç",
    usernameCopy: "Bu ad sıralamada görünür, e-posta adresin görünmez. Kullanıcı adı sonradan değiştirilemez.",
    username: "Kullanıcı adı",
    usernameHint: "3–7 karakter · harf, rakam veya _",
    saveUsername: "Kullanıcı adını kaydet",
    usernameTaken: "Bu kullanıcı adı kullanılıyor.",
    usernameInvalid: "3–7 karakterlik harf, rakam veya alt çizgi kullan.",
    signedInAs: "Giriş yapılan e-posta",
    signOut: "Çıkış yap",
    boardTitle: "Nota Nota sıralaması",
    boardEmpty: "Bu kategoride henüz bir skor yok.",
    loading: "Yükleniyor…",
    standard: "Normal",
    endless: "Sonsuz",
    staff: "Porteden oku",
    position: "Konumu oku",
    saveScore: "Skorumu sıralamaya ekle",
    guestScoreTitle: "Bu skoru kaybetme.",
    guestScoreCopy: "E-postayla ücretsiz giriş yaparak skorunu hesabına kaydedebilir ve sıralamaya ekleyebilirsin. E-posta adresin sıralamada görünmez.",
    scoreSignInWarning: "Bu skoru kaydetmek ve sıralamaya eklemek için önce e-posta adresini doğrulaman gerekiyor.",
    chooseUsername: "Skoru kaydetmek için kullanıcı adı seç",
    saved: "Yeni kişisel rekorun kaydedildi.",
    notBetter: "Bu sonuç mevcut kişisel rekorunu geçmedi.",
    pendingIneligible: "Bekleyen skor sıralama koşullarını karşılamadı.",
    ineligibleStandard: "Normal sıralamaya yalnızca hiç yanlış yapılmadan tamamlanan oturumlar girer.",
    ineligibleEndless: "Sonsuz sıralamaya yalnızca hiç yanlış yapılmayan oturumlar girer.",
    confirmTitle: "Bu e-posta adresini doğruluyor musun?",
    confirmCopy: "Giriş bağlantısını tamamlamak için aşağıdaki düğmeye bas.",
    confirmButton: "E-postamı doğrula",
    legal: "KVKK",
    privacy: "Gizlilik",
  },
  en: {
    leaderboard: "Leaderboard",
    signIn: "Sign in",
    account: "Account",
    close: "Close",
    emailTitle: "Sign in by email",
    emailCopy: "We will send you a one-time verification link. No password is required.",
    email: "Email address",
    sendLink: "Send verification link",
    sendingLink: "Sending…",
    privacyAssurance: "We never sell your email or share it for advertising or marketing. It is processed by our service providers only to provide secure sign-in.",
    linkSent: "Link sent. Check your inbox.",
    backendPending: "Community features will open after the private setup is complete.",
    usernameTitle: "Choose your username",
    usernameCopy: "This name is public on the leaderboard; your email is not. The username cannot be changed later.",
    username: "Username",
    usernameHint: "3–7 characters · letters, numbers, or _",
    saveUsername: "Save username",
    usernameTaken: "That username is already taken.",
    usernameInvalid: "Use 3–7 letters, numbers, or underscores.",
    signedInAs: "Signed-in email",
    signOut: "Sign out",
    boardTitle: "Nota Nota leaderboard",
    boardEmpty: "There are no scores in this category yet.",
    loading: "Loading…",
    standard: "Standard",
    endless: "Endless",
    staff: "Read the staff",
    position: "Read the position",
    saveScore: "Add my score to the leaderboard",
    guestScoreTitle: "Keep this score.",
    guestScoreCopy: "Sign in free by email to save this result to your account and add it to the leaderboard. Your email is never shown publicly.",
    scoreSignInWarning: "Confirm your email address first to save this score and add it to the leaderboard.",
    chooseUsername: "Choose a username to save this score",
    saved: "Your new personal best was saved.",
    notBetter: "This result did not beat your personal best.",
    pendingIneligible: "The pending score did not meet the leaderboard requirements.",
    ineligibleStandard: "Only standard sessions completed without a mistake qualify for the leaderboard.",
    ineligibleEndless: "Only endless sessions with no mistakes qualify for the leaderboard.",
    confirmTitle: "Do you confirm this email address?",
    confirmCopy: "Press the button below to complete the sign-in link.",
    confirmButton: "Confirm my email",
    legal: "KVKK notice",
    privacy: "Privacy",
  },
} as const;

type CommunityContextValue = {
  locale: Locale;
  user: User | null;
  profile: Profile | null;
  openPanel: (panel: Exclude<Panel, "confirm">, notice?: string) => void;
};

const CommunityContext = createContext<CommunityContextValue | null>(null);

function useCommunity() {
  const value = useContext(CommunityContext);
  if (!value) throw new Error("Community components must be inside CommunityProvider");
  return value;
}

export function CommunityProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [panelNotice, setPanelNotice] = useState("");
  const [accountStatus, setAccountStatus] = useState<AccountStatus>(null);
  const pendingScoreInFlight = useRef(false);
  const text = TEXT[locale];

  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get("token_hash");
    if (!communityConfigured || !tokenHash || url.searchParams.get("type") !== "email") return;
    const timer = window.setTimeout(() => {
      setConfirmationToken(tokenHash);
      setPanel("confirm");
      window.history.replaceState({}, document.title, `${url.pathname}${url.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    async function synchronize(nextUser: User | null) {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        return;
      }
      try {
        const nextProfile = await getMyProfile();
        setProfile(nextProfile);
        if (!nextProfile) {
          setPanel("account");
          return;
        }

        const pendingScore = readPendingScore();
        if (pendingScore && !pendingScoreInFlight.current) {
          pendingScoreInFlight.current = true;
          try {
            const result = await submitBestScore(pendingScore);
            clearPendingScore();
            setAccountStatus(result);
          } catch {
            setAccountStatus("backend_pending");
          } finally {
            pendingScoreInFlight.current = false;
          }
          setPanel("account");
        }
      } catch {
        setProfile(null);
      }
    }

    void supabase.auth.getSession().then(({ data }) => synchronize(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void synchronize(session?.user ?? null), 0);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  function openPanel(nextPanel: Exclude<Panel, "confirm">, notice = "") {
    setPanelNotice(notice);
    setPanel(nextPanel);
  }

  function closePanel() {
    setPanel(null);
    setPanelNotice("");
    setAccountStatus(null);
  }

  async function confirmEmail() {
    if (!supabase || !confirmationToken) return;
    setConfirming(true);
    setConfirmationMessage("");
    const { error } = await supabase.auth.verifyOtp({
      token_hash: confirmationToken,
      type: "email",
    });
    setConfirming(false);
    if (error) {
      setConfirmationMessage(error.message);
      return;
    }
    setConfirmationToken(null);
    setPanel(null);
  }

  return (
    <CommunityContext.Provider value={{ locale, user, profile, openPanel }}>
      {children}
      {panel && (
        <Modal title={panelTitle(panel, text)} closeLabel={text.close} onClose={closePanel}>
          {panel === "auth" && <AuthPanel locale={locale} notice={panelNotice} />}
          {panel === "account" && (
            <AccountPanel
              locale={locale}
              user={user}
              profile={profile}
              onProfile={(username) => setProfile({ username })}
              notice={accountStatus ? accountStatusCopy(accountStatus, text) : ""}
              onScoreStatus={setAccountStatus}
              onClose={closePanel}
            />
          )}
          {panel === "leaderboard" && <LeaderboardPanel locale={locale} />}
          {panel === "legal" && <LegalNotice locale={locale} />}
          {panel === "confirm" && confirmationToken && (
            <div className="confirm-panel">
              <p>{text.confirmCopy}</p>
              <button className="primary-button" type="button" onClick={() => void confirmEmail()} disabled={confirming}>
                {text.confirmButton} <span aria-hidden="true">→</span>
              </button>
              <p className="community-message" aria-live="polite">{confirmationMessage}</p>
            </div>
          )}
        </Modal>
      )}
    </CommunityContext.Provider>
  );
}

function panelTitle(panel: Panel, text: (typeof TEXT)[Locale]) {
  if (panel === "auth") return text.emailTitle;
  if (panel === "account") return text.usernameTitle;
  if (panel === "leaderboard") return text.boardTitle;
  if (panel === "legal") return text.legal;
  return text.confirmTitle;
}

function accountStatusCopy(status: Exclude<AccountStatus, null>, text: (typeof TEXT)[Locale]) {
  if (status === "saved") return text.saved;
  if (status === "not_better") return text.notBetter;
  if (status === "ineligible") return text.pendingIneligible;
  return text.backendPending;
}

function Modal({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="community-modal-title">
        <header>
          <h2 id="community-modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel}>
            <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function AuthPanel({ locale, notice }: { locale: Locale; notice: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { openPanel } = useCommunity();
  const text = TEXT[locale];

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage(text.backendPending);
      return;
    }

    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    setMessage(error ? error.message : text.linkSent);
  }

  return (
    <form className="community-form" onSubmit={requestLink}>
      {notice && <p className="community-auth-notice" role="status">{notice}</p>}
      <p>{text.emailCopy}</p>
      <label htmlFor="community-email">{text.email}</label>
      <input id="community-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" disabled={busy} />
      <button className="primary-button" type="submit" disabled={busy || !email.trim()} aria-busy={busy}>
        {busy ? text.sendingLink : text.sendLink} <span aria-hidden="true">{busy ? "…" : "→"}</span>
      </button>
      <p className="community-message" aria-live="polite">{message}</p>
      <p className="community-fineprint">{text.privacyAssurance} <button type="button" onClick={() => openPanel("legal")}>{text.legal}</button></p>
    </form>
  );
}

function AccountPanel({ locale, user, profile, onProfile, notice, onScoreStatus, onClose }: { locale: Locale; user: User | null; profile: Profile | null; onProfile: (username: string) => void; notice: string; onScoreStatus: (status: AccountStatus) => void; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const text = TEXT[locale];

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!/^[A-Za-z0-9_]{3,7}$/.test(username)) {
      setMessage(text.usernameInvalid);
      return;
    }
    setBusy(true);
    try {
      const claimed = await claimUsername(username);
      const pendingScore = readPendingScore();
      if (pendingScore) {
        try {
          const result = await submitBestScore(pendingScore);
          clearPendingScore();
          onScoreStatus(result);
        } catch {
          onScoreStatus("backend_pending");
        }
      }
      onProfile(claimed);
      if (!pendingScore) onClose();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setMessage(detail.includes("username_taken") ? text.usernameTaken : text.usernameInvalid);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onClose();
  }

  if (!communityConfigured) return <p>{text.backendPending}</p>;
  if (!user) return <p>{text.emailCopy}</p>;

  return (
    <div className="account-panel">
      <p><span>{text.signedInAs}</span><strong>{user.email}</strong></p>
      {profile ? (
        <>
          <div className="username-display">@{profile.username}</div>
          {notice && <p className="community-message" aria-live="polite">{notice}</p>}
          <button className="secondary-button" type="button" onClick={() => void signOut()} disabled={busy}>{text.signOut}</button>
        </>
      ) : (
        <form className="community-form" onSubmit={save}>
          <p>{text.usernameCopy}</p>
          <label htmlFor="community-username">{text.username}</label>
          <input id="community-username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={7} autoComplete="username" />
          <small>{text.usernameHint}</small>
          <button className="primary-button" type="submit" disabled={busy}>{text.saveUsername}<span>→</span></button>
          <p className="community-message" aria-live="polite">{message}</p>
        </form>
      )}
    </div>
  );
}

function LeaderboardPanel({ locale }: { locale: Locale }) {
  const [sessionType, setSessionType] = useState<SessionType>("standard");
  const [level, setLevel] = useState<PracticeLevel>("temel");
  const [questionMode, setQuestionMode] = useState<QuestionMode>("porte");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const text = TEXT[locale];

  useEffect(() => {
    if (!communityConfigured) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setMessage("");
      void getLeaderboard(sessionType, level, questionMode)
        .then(setRows)
        .catch(() => setMessage(text.backendPending))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [level, questionMode, sessionType, text.backendPending]);

  return (
    <div className="leaderboard-panel">
      <div className="leaderboard-filters">
        <select aria-label={locale === "tr" ? "Oturum türü" : "Session type"} value={sessionType} onChange={(event) => setSessionType(event.target.value as SessionType)}>
          <option value="standard">{text.standard}</option>
          <option value="endless">{text.endless}</option>
        </select>
        <select aria-label={locale === "tr" ? "Çalışma alanı" : "Practice range"} value={level} onChange={(event) => setLevel(event.target.value as PracticeLevel)}>
          <option value="temel">{locale === "tr" ? "Temel porte" : "Notes on the staff"}</option>
          <option value="yakin">{locale === "tr" ? "Yakın çevre" : "Staff + ledger lines"}</option>
          <option value="tam">{locale === "tr" ? "Tam doğal sesler" : "Full natural range"}</option>
        </select>
        <select aria-label={locale === "tr" ? "Soru biçimi" : "Question style"} value={questionMode} onChange={(event) => setQuestionMode(event.target.value as QuestionMode)}>
          <option value="porte">{text.staff}</option>
          <option value="konum">{text.position}</option>
        </select>
      </div>
      {!communityConfigured ? <p>{text.backendPending}</p> : loading ? <p>{text.loading}</p> : message ? <p>{message}</p> : rows.length ? (
        <ol className="leaderboard-list">
          {rows.map((row) => (
            <li key={`${row.rank}-${row.username}`}>
              <b>{row.rank}</b>
              <strong>@{row.username}</strong>
              {sessionType === "standard" ? (
                <span>{formatSeconds(row.total_response_time_ms, locale)}</span>
              ) : (
                <span>{row.correct_count} {locale === "tr" ? "doğru" : "correct"} · {formatSeconds(row.average_response_time_ms, locale)} / {locale === "tr" ? "nota" : "note"}</span>
              )}
            </li>
          ))}
        </ol>
      ) : <p>{text.boardEmpty}</p>}
    </div>
  );
}

function formatSeconds(milliseconds: number, locale: Locale) {
  return `${(milliseconds / 1000).toFixed(2).replace(".", locale === "tr" ? "," : ".")} ${locale === "tr" ? "sn" : "sec"}`;
}

export function CommunityHeader() {
  const { locale, user, profile, openPanel } = useCommunity();
  const text = TEXT[locale];
  return (
    <div className="community-header-actions">
      <button type="button" onClick={() => openPanel("leaderboard")}>{text.leaderboard}</button>
      <button type="button" onClick={() => openPanel(user ? "account" : "auth")}>{profile ? `@${profile.username}` : user ? text.account : text.signIn}</button>
    </div>
  );
}

export function CommunityResult({ score, eligible }: { score: ScoreSubmission; eligible: boolean }) {
  const { locale, user, profile, openPanel } = useCommunity();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const text = TEXT[locale];

  const eligibilityCopy = score.sessionType === "standard" ? text.ineligibleStandard : text.ineligibleEndless;

  async function save() {
    if (!user) {
      rememberPendingScore(score);
      return openPanel("auth", text.scoreSignInWarning);
    }
    if (!profile) {
      rememberPendingScore(score);
      return openPanel("account");
    }
    setBusy(true);
    try {
      const result = await submitBestScore(score);
      setStatus(result === "saved" ? text.saved : result === "not_better" ? text.notBetter : eligibilityCopy);
    } catch {
      setStatus(text.backendPending);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="community-result-card">
      <div>
        <p className="kicker">{text.leaderboard}</p>
        <strong>{eligible && !user ? text.guestScoreTitle : eligible ? text.saveScore : eligibilityCopy}</strong>
        {eligible && !user && <p className="community-result-note">{text.guestScoreCopy}</p>}
      </div>
      {eligible && (
        <button type="button" onClick={save} disabled={busy || !communityConfigured}>
          {!communityConfigured ? text.backendPending : !user ? text.saveScore : !profile ? text.chooseUsername : text.saveScore}
        </button>
      )}
      {status && <p className="community-message" aria-live="polite">{status}</p>}
    </div>
  );
}

export function CommunityLegalLink() {
  const { locale, openPanel } = useCommunity();
  const text = TEXT[locale];
  return <button className="footer-link" type="button" onClick={() => openPanel("legal")}>{text.privacy} · {text.legal}</button>;
}

function LegalNotice({ locale }: { locale: Locale }) {
  const isTurkish = locale === "tr";
  return (
    <article className="legal-copy">
      <p className="legal-draft"><strong>{isTurkish ? "Yayın öncesi taslak" : "Pre-release draft"}</strong> — {isTurkish ? "Başvuru adresi/KEP bilgisi ve yurt dışı aktarım mekanizması hukukçu tarafından tamamlanmalıdır." : "The application address/KEP details and cross-border transfer mechanism must be completed with legal counsel."}</p>
      <h3>{isTurkish ? "Veri sorumlusu" : "Data controller"}</h3>
      <p>Alper Ferit Koç · kvkk@notanota.online</p>
      <h3>{isTurkish ? "İşlenen veriler ve amaçlar" : "Data and purposes"}</h3>
      <p>{isTurkish ? "E-posta adresi yalnızca şifresiz hesap doğrulaması ve hesap güvenliği için; 3–7 karakterli kullanıcı adı ile en iyi oturum skorları leaderboard için işlenir. E-posta leaderboard’da yayımlanmaz. Hizmet reklam veya pazarlama profili oluşturmaz." : "Email is processed only for passwordless account verification and account security. A 3–7 character username and personal-best session scores are processed for the leaderboard. Email is never published on the leaderboard. The service does not build advertising or marketing profiles."}</p>
      <h3>{isTurkish ? "Toplama yöntemi, hukuki sebep ve aktarım" : "Collection, legal basis, and transfers"}</h3>
      <p>{isTurkish ? "Veriler hesap oluşturma ve çalışma oturumları sırasında elektronik olarak toplanır. Hesap ve leaderboard hizmetinin kurulması/ifası ile hizmet güvenliğine ilişkin meşru menfaat dayanakları taslak olarak esas alınmıştır. Kimlik doğrulama ve veritabanı hizmetleri Supabase; e-posta teslimi Resend veya yapılandırılacak SMTP sağlayıcısı üzerinden yürütülecektir. Bu sağlayıcılar yurt dışında veri işleyebilir; KVKK madde 9 kapsamındaki uygun güvence süreci tamamlanmadan hizmet kamuya açılmayacaktır." : "Data is collected electronically during account creation and practice sessions. This draft relies on service performance and legitimate interests in service security. Authentication and database services will use Supabase; email delivery will use Resend or the configured SMTP provider. These processors may handle data abroad; the public service will not open until the applicable KVKK Article 9 safeguard process is complete."}</p>
      <h3>{isTurkish ? "Saklama ve güvenlik" : "Retention and security"}</h3>
      <p>{isTurkish ? "Hesap, kullanıcı adı ve kişisel rekorlar hesap silinene kadar saklanır. Tek kullanımlık giriş bağlantıları kısa süreli ve tek kullanımlıdır. E-posta adresleri satılmaz; reklam veya pazarlama amacıyla paylaşılmaz. Güvenli girişin sağlanması için yalnızca Supabase ve yapılandırılan e-posta teslim sağlayıcısı tarafından işlenir. Zorunlu oturum verileri dışında takip/analiz çerezi kullanılmaz." : "The account, username, and personal-best scores are retained until the account is deleted. Sign-in links are short-lived and single-use. Email addresses are never sold or shared for advertising or marketing. They are processed only by Supabase and the configured email delivery provider to provide secure sign-in. No tracking or analytics cookies are used beyond essential authentication storage."}</p>
      <h3>{isTurkish ? "Haklar ve başvuru" : "Rights and requests"}</h3>
      <p>{isTurkish ? "KVKK madde 11 kapsamındaki erişim, düzeltme, silme, işleme ve aktarıma ilişkin bilgi alma ile itiraz hakların için kvkk@notanota.online adresine başvurabilirsin. Başvurular en geç 30 gün içinde sonuçlandırılır. Kamuya açılmadan önce posta/KEP başvuru adresi buraya eklenecektir." : "You may contact kvkk@notanota.online regarding access, correction, deletion, processing and transfer information, and objection rights under KVKK Article 11. Requests are answered within 30 days. A postal/KEP application address will be added before public launch."}</p>
    </article>
  );
}
