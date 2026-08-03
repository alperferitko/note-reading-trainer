"use client";

import type { User } from "@supabase/supabase-js";
import {
  FormEvent,
  ReactNode,
  useCallback,
  createContext,
  useContext,
  useEffect,
  useId,
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
import {
  getMyPracticeStreak,
  PracticeStreak,
  recordPracticeDay,
} from "@/lib/practice-streak";
import {
  DELETE_ACCOUNT_CONFIRMATION,
  deleteCurrentAccount,
} from "@/lib/delete-account.mjs";

type Locale = "tr" | "en";
type Panel = "auth" | "account" | "delete" | "leaderboard" | "legal" | "confirm" | null;
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
      && ["temel", "yakin", "tam", "genis"].includes(score.level)
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
    usernameHint: "3–7 karakter; harf, rakam veya _",
    saveUsername: "Kullanıcı adını kaydet",
    usernameTaken: "Bu kullanıcı adı kullanılıyor.",
    usernameInvalid: "3–7 karakterlik harf, rakam veya alt çizgi kullan.",
    signedInAs: "Giriş yapılan e-posta",
    signOut: "Çıkış yap",
    deleteTitle: "Hesabı sil",
    deleteExplanation: "Hesabın, kullanıcı adın, skorların ve çalışma serisi kayıtların kalıcı olarak silinir. Bu işlem geri alınamaz.",
    deleteButton: "Hesabımı sil",
    deleteDangerLabel: "Kalıcı işlem",
    deleteConfirmCopy: "Devam etmek için aşağıdaki ifadeyi eksiksiz yaz:",
    deletePhrase: "HESABIMI SİL",
    deleteInputLabel: "Onay ifadesi",
    deleteConfirmButton: "Hesabımı kalıcı olarak sil",
    deleting: "Hesabın siliniyor…",
    deleteError: "Hesabın şu anda silinemedi. Hesabın açık kalmaya devam ediyor; tekrar deneyebilirsin.",
    deleteSuccess: "Hesabın ve ilişkili kayıtların silindi.",
    cancel: "Vazgeç",
    boardTitle: "NotaNota sıralaması",
    boardEmpty: "Bu kategoride henüz skor yok. İlk sırayı sen aç.",
    loading: "Yükleniyor…",
    standard: "Normal",
    endless: "Sonsuz",
    staff: "Porteden oku",
    position: "Konumu oku",
    saveScore: "Skorumu sıralamaya ekle",
    guestScoreTitle: "Skorunu kaybetme.",
    guestScoreCopy: "E-postayla ücretsiz giriş yaparak bu skorunu kaydedebilir ve sonraki çalışma günlerinden günlük seri oluşturabilirsin. E-posta adresin sıralamada görünmez.",
    scoreSignInWarning: "Bu skoru kaydetmek ve sıralamaya eklemek için önce e-posta adresini doğrulaman gerekiyor.",
    chooseUsername: "Skoru kaydetmek için kullanıcı adı seç",
    saved: "Yeni kişisel rekorun kaydedildi.",
    notBetter: "Bu sonuç mevcut kişisel rekorunu geçmedi.",
    pendingIneligible: "Bekleyen skor sıralama koşullarını karşılamadı.",
    ineligibleStandard: "Normal sıralamaya yalnızca hiç yanlış yapılmadan tamamlanan oturumlar girer.",
    ineligibleEndless: "Sonsuz sıralamaya yalnızca hiç yanlış yapılmayan oturumlar girer.",
    ineligibleEncouragement: "Bir sonraki turda tamamını doğru okuyacağına inanıyorum. Sakin kal, başarabilirsin.",
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
    usernameHint: "3–7 characters; letters, numbers, or _",
    saveUsername: "Save username",
    usernameTaken: "That username is already taken.",
    usernameInvalid: "Use 3–7 letters, numbers, or underscores.",
    signedInAs: "Signed-in email",
    signOut: "Sign out",
    deleteTitle: "Delete account",
    deleteExplanation: "Your account, username, scores and practice streak records will be permanently deleted. This action cannot be undone.",
    deleteButton: "Delete my account",
    deleteDangerLabel: "Permanent action",
    deleteConfirmCopy: "To continue, type the following phrase exactly:",
    deletePhrase: DELETE_ACCOUNT_CONFIRMATION,
    deleteInputLabel: "Confirmation phrase",
    deleteConfirmButton: "Permanently delete my account",
    deleting: "Deleting your account…",
    deleteError: "Your account could not be deleted right now. It remains active; you can try again.",
    deleteSuccess: "Your account and related records were deleted.",
    cancel: "Cancel",
    boardTitle: "NotaNota leaderboard",
    boardEmpty: "No scores here yet. Set the first benchmark.",
    loading: "Loading…",
    standard: "Standard",
    endless: "Endless",
    staff: "Read the staff",
    position: "Read the position",
    saveScore: "Add my score to the leaderboard",
    guestScoreTitle: "Keep this score.",
    guestScoreCopy: "Sign in free by email to save this result and build a daily streak from future practice days. Your email is never shown publicly.",
    scoreSignInWarning: "Confirm your email address first to save this score and add it to the leaderboard.",
    chooseUsername: "Choose a username to save this score",
    saved: "Your new personal best was saved.",
    notBetter: "This result did not beat your personal best.",
    pendingIneligible: "The pending score did not meet the leaderboard requirements.",
    ineligibleStandard: "Only standard sessions completed without a mistake qualify for the leaderboard.",
    ineligibleEndless: "Only endless sessions with no mistakes qualify for the leaderboard.",
    ineligibleEncouragement: "I’m sure you can read every note correctly next time. Stay calm, you’ve got this.",
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
  authReady: boolean;
  streak: PracticeStreak | null;
  streakLoading: boolean;
  streakError: boolean;
  openPanel: (panel: Exclude<Panel, "confirm">, notice?: string) => void;
  refreshPracticeStreak: () => Promise<boolean>;
  recordPracticeCompletion: () => Promise<boolean>;
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
  const [authReady, setAuthReady] = useState(!communityConfigured);
  const [streak, setStreak] = useState<PracticeStreak | null>(null);
  const [streakLoading, setStreakLoading] = useState(false);
  const [streakError, setStreakError] = useState(false);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [panelNotice, setPanelNotice] = useState("");
  const [accountStatus, setAccountStatus] = useState<AccountStatus>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const pendingScoreInFlight = useRef(false);
  const streakRequestId = useRef(0);
  const deletionNoticeRef = useRef<HTMLDivElement>(null);
  const text = TEXT[locale];

  const refreshPracticeStreak = useCallback(async () => {
    const requestId = ++streakRequestId.current;
    setStreakLoading(true);
    setStreakError(false);
    try {
      const nextStreak = await getMyPracticeStreak();
      if (requestId === streakRequestId.current) setStreak(nextStreak);
      return true;
    } catch {
      if (requestId === streakRequestId.current) setStreakError(true);
      return false;
    } finally {
      if (requestId === streakRequestId.current) setStreakLoading(false);
    }
  }, []);

  const recordPracticeCompletion = useCallback(async () => {
    if (!user) return false;
    const requestId = ++streakRequestId.current;
    setStreakLoading(true);
    setStreakError(false);
    try {
      const nextStreak = await recordPracticeDay();
      if (requestId === streakRequestId.current) setStreak(nextStreak);
      return true;
    } catch {
      if (requestId === streakRequestId.current) setStreakError(true);
      return false;
    } finally {
      if (requestId === streakRequestId.current) setStreakLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get("token_hash");
    if (!communityConfigured || !tokenHash || url.searchParams.get("type") !== "email") return;
    const timer = window.setTimeout(() => {
      setConfirmationToken(tokenHash);
      setPanel("confirm");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    async function synchronize(nextUser: User | null) {
      setUser(nextUser);
      if (!nextUser) {
        streakRequestId.current += 1;
        setProfile(null);
        setStreak(null);
        setStreakError(false);
        setStreakLoading(false);
        return;
      }
      setStreak(null);
      setStreakError(false);
      void refreshPracticeStreak();
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

    void supabase.auth.getSession()
      .then(({ data }) => synchronize(data.session?.user ?? null))
      .finally(() => setAuthReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        void synchronize(session?.user ?? null).finally(() => setAuthReady(true));
      }, 0);
    });

    return () => data.subscription.unsubscribe();
  }, [refreshPracticeStreak]);

  useEffect(() => {
    if (accountDeleted) deletionNoticeRef.current?.focus({ preventScroll: true });
  }, [accountDeleted]);

  function openPanel(nextPanel: Exclude<Panel, "confirm">, notice = "") {
    setPanelNotice(notice);
    setPanel(nextPanel);
  }

  const closePanel = useCallback(() => {
    if (deletionBusy) return;
    setPanel(null);
    setPanelNotice("");
    setAccountStatus(null);
  }, [deletionBusy]);

  const finishAccountDeletion = useCallback(() => {
    clearPendingScore();
    pendingScoreInFlight.current = false;
    streakRequestId.current += 1;
    setUser(null);
    setProfile(null);
    setStreak(null);
    setStreakError(false);
    setStreakLoading(false);
    setAccountStatus(null);
    setPanelNotice("");
    setPanel(null);
    setDeletionBusy(false);
    setAuthReady(true);
    setAccountDeleted(true);
  }, []);

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
    const url = new URL(window.location.href);
    url.searchParams.delete("token_hash");
    url.searchParams.delete("type");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <CommunityContext.Provider value={{
      locale,
      user,
      profile,
      authReady,
      streak,
      streakLoading,
      streakError,
      openPanel,
      refreshPracticeStreak,
      recordPracticeCompletion,
    }}>
      {children}
      {accountDeleted && (
        <div className="community-toast" ref={deletionNoticeRef} role="status" aria-live="polite" tabIndex={-1}>
          <span aria-hidden="true">✓</span>
          <p>{text.deleteSuccess}</p>
          <button type="button" onClick={() => setAccountDeleted(false)} aria-label={text.close}>×</button>
        </div>
      )}
      {panel && (
        <Modal title={panel === "account" && profile ? text.account : panelTitle(panel, text)} closeLabel={text.close} onClose={closePanel} wide={panel === "leaderboard"} dismissible={!deletionBusy}>
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
              onDelete={() => openPanel("delete")}
            />
          )}
          {panel === "delete" && user && supabase && (
            <DeleteAccountPanel
              locale={locale}
              onBusyChange={setDeletionBusy}
              onCancel={closePanel}
              onDeleted={finishAccountDeletion}
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
  if (panel === "delete") return text.deleteTitle;
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

function Modal({ title, closeLabel, onClose, children, wide = false, dismissible = true }: { title: string; closeLabel: string; onClose: () => void; children: ReactNode; wide?: boolean; dismissible?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;

    const previousOverflow = document.body.style.overflow;
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const appWasInert = appShell?.hasAttribute("inert") ?? false;
    document.body.style.overflow = "hidden";
    appShell?.setAttribute("inert", "");
    const initialFocus = dialog.querySelector<HTMLElement>("input:not(:disabled)")
      ?? dialog.querySelector<HTMLElement>("[data-modal-close], button:not(:disabled), a[href]");
    initialFocus?.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!dismissible) return;
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [...dialog!.querySelectorAll<HTMLElement>(
        "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
      )].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = previousOverflow;
      if (!appWasInert) appShell?.removeAttribute("inert");
      previouslyFocused?.focus();
    };
  }, [dismissible, onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => dismissible && event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className={`modal-card ${wide ? "modal-card--leaderboard" : ""}`} role="dialog" aria-modal="true" aria-labelledby="community-modal-title">
        <header>
          <h2 id="community-modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} data-modal-close disabled={!dismissible}>
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
  const [failed, setFailed] = useState(false);
  const { openPanel } = useCommunity();
  const text = TEXT[locale];

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage(text.backendPending);
      setFailed(true);
      return;
    }

    setBusy(true);
    setFailed(false);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    setFailed(Boolean(error));
    setMessage(error ? error.message : text.linkSent);
  }

  return (
    <form className="community-form" onSubmit={requestLink}>
      {notice && <p className="community-auth-notice" role="status">{notice}</p>}
      <p id="community-email-help">{text.emailCopy}</p>
      <label htmlFor="community-email">{text.email}</label>
      <input id="community-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" disabled={busy} aria-describedby="community-email-help community-email-status" aria-invalid={failed} />
      <button className="primary-button" type="submit" disabled={busy || !email.trim()} aria-busy={busy}>
        {busy ? text.sendingLink : text.sendLink} <span aria-hidden="true">{busy ? "…" : "→"}</span>
      </button>
      <p id="community-email-status" className="community-message" role={failed ? "alert" : "status"} aria-live={failed ? "assertive" : "polite"}>{message}</p>
      <p className="community-fineprint">{text.privacyAssurance} <button type="button" onClick={() => openPanel("legal")}>{text.legal}</button></p>
    </form>
  );
}

function AccountPanel({ locale, user, profile, onProfile, notice, onScoreStatus, onClose, onDelete }: { locale: Locale; user: User | null; profile: Profile | null; onProfile: (username: string) => void; notice: string; onScoreStatus: (status: AccountStatus) => void; onClose: () => void; onDelete: () => void }) {
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
          <CommunityPracticeStreak compact />
          {notice && <p className="community-message" aria-live="polite">{notice}</p>}
          <button className="secondary-button" type="button" onClick={() => void signOut()} disabled={busy}>{text.signOut}</button>
          {message && <p className="community-message" role="alert">{message}</p>}
          <AccountDangerZone locale={locale} onDelete={onDelete} disabled={busy} />
        </>
      ) : (
        <>
          <form className="community-form" onSubmit={save}>
            <p>{text.usernameCopy}</p>
            <label htmlFor="community-username">{text.username}</label>
            <input id="community-username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={7} pattern="[A-Za-z0-9_]{3,7}" required autoComplete="username" aria-describedby="community-username-hint community-username-status" aria-invalid={Boolean(message)} disabled={busy} />
            <small id="community-username-hint">{text.usernameHint}</small>
            <button className="primary-button" type="submit" disabled={busy}>{text.saveUsername}<span aria-hidden="true">→</span></button>
            <p id="community-username-status" className="community-message" role={message ? "alert" : "status"} aria-live="polite">{message}</p>
          </form>
          <button className="secondary-button" type="button" onClick={() => void signOut()} disabled={busy}>{text.signOut}</button>
          <AccountDangerZone locale={locale} onDelete={onDelete} disabled={busy} />
        </>
      )}
    </div>
  );
}

function AccountDangerZone({ locale, onDelete, disabled }: { locale: Locale; onDelete: () => void; disabled: boolean }) {
  const text = TEXT[locale];
  const descriptionId = useId();
  return (
    <section className="account-danger-zone" aria-labelledby={`${descriptionId}-title`}>
      <p>{text.deleteDangerLabel}</p>
      <h3 id={`${descriptionId}-title`}>{text.deleteTitle}</h3>
      <span id={descriptionId}>{text.deleteExplanation}</span>
      <button className="danger-button" type="button" onClick={onDelete} disabled={disabled} aria-describedby={descriptionId}>
        {text.deleteButton}
      </button>
    </section>
  );
}

function DeleteAccountPanel({ locale, onBusyChange, onCancel, onDeleted }: { locale: Locale; onBusyChange: (busy: boolean) => void; onCancel: () => void; onDeleted: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputId = useId();
  const statusId = useId();
  const text = TEXT[locale];
  const matches = confirmation === text.deletePhrase;

  async function confirmDeletion(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy || !matches) return;

    setBusy(true);
    onBusyChange(true);
    setMessage("");
    try {
      await deleteCurrentAccount(supabase);
      clearPendingScore();
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // The Auth user is already deleted; local React state is cleared below
        // even if the client cannot complete its best-effort session cleanup.
      }
      onDeleted();
    } catch {
      setMessage(text.deleteError);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <form className="delete-account-panel" onSubmit={confirmDeletion} aria-describedby={statusId}>
      <div className="delete-account-warning">
        <strong>{text.deleteDangerLabel}</strong>
        <p>{text.deleteExplanation}</p>
      </div>
      <p>{text.deleteConfirmCopy}</p>
      <code>{text.deletePhrase}</code>
      <label htmlFor={inputId}>{text.deleteInputLabel}</label>
      <input
        id={inputId}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        disabled={busy}
      />
      <div className="delete-account-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{text.cancel}</button>
        <button className="danger-button" type="submit" disabled={busy || !matches} aria-busy={busy}>
          {busy ? text.deleting : text.deleteConfirmButton}
        </button>
      </div>
      <p id={statusId} className="community-message" role={message ? "alert" : "status"} aria-live="polite">
        {busy ? text.deleting : message}
      </p>
    </form>
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
  const labels = locale === "tr" ? {
    session: "Oturum",
    range: "Çalışma alanı",
    question: "Soru biçimi",
    current: "Gösterilen kategori",
    player: "Oyuncu",
    result: "Sonuç",
    levels: {
      temel: "Temel porte",
      yakin: "Yakın çevre",
      tam: "Tam doğal sesler",
      genis: "Geniş porte",
    },
    standardRule: "Bütün notaları hatasız tamamlayanlarda en hızlı süre kazanır",
    endlessRule: "Hatasız en uzun seri kazanır; eşitlikte daha hızlı tempo öne geçer",
  } : {
    session: "Session",
    range: "Practice range",
    question: "Question style",
    current: "Current category",
    player: "Player",
    result: "Result",
    levels: {
      temel: "Notes on the staff",
      yakin: "Staff + ledger lines",
      tam: "Full natural range",
      genis: "Extended ledger range",
    },
    standardRule: "Among perfect completed runs, the fastest time wins",
    endlessRule: "The longest perfect streak wins; speed breaks a tie",
  };

  useEffect(() => {
    if (!communityConfigured) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setMessage("");
      void getLeaderboard(sessionType, level, questionMode)
        .then((nextRows) => {
          if (!cancelled) setRows(nextRows);
        })
        .catch(() => {
          if (!cancelled) setMessage(text.backendPending);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [level, questionMode, sessionType, text.backendPending]);

  return (
    <div className="leaderboard-panel">
      <section className="leaderboard-main" aria-busy={loading} aria-labelledby="leaderboard-current-category">
        <div className="leaderboard-current-view" id="leaderboard-current-category">
          <p>{labels.current}</p>
          <strong>{text[sessionType]}, {labels.levels[level]}, {questionMode === "porte" ? text.staff : text.position}</strong>
          <span>{sessionType === "standard" ? labels.standardRule : labels.endlessRule}</span>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{loading ? text.loading : message || `${rows.length} ${locale === "tr" ? "sonuç" : "results"}`}</p>
        {!communityConfigured ? <p>{text.backendPending}</p> : loading ? <p>{text.loading}</p> : message ? <p>{message}</p> : rows.length ? (
          <div className="leaderboard-table">
            <div className="leaderboard-table-head" aria-hidden="true"><span>#</span><span>{labels.player}</span><span>{labels.result}</span></div>
            <ol className="leaderboard-list">
              {rows.map((row) => (
                <li key={`${row.rank}-${row.username}`}>
                  <b>#{row.rank}</b>
                  <strong>@{row.username}</strong>
                  {sessionType === "standard" ? (
                    <span>{formatSeconds(row.total_response_time_ms, locale)}</span>
                  ) : (
                    <span>{row.correct_count} {locale === "tr" ? "doğru" : "correct"}, {formatSeconds(row.average_response_time_ms, locale)} / {locale === "tr" ? "nota" : "note"}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : <p>{text.boardEmpty}</p>}
      </section>
      <aside className="leaderboard-controls">
        <fieldset className="leaderboard-filter-group">
          <legend>{labels.session}</legend>
          <div className="leaderboard-segments leaderboard-segments--two">
            <button type="button" aria-pressed={sessionType === "standard"} onClick={() => setSessionType("standard")}>{text.standard}</button>
            <button type="button" aria-pressed={sessionType === "endless"} onClick={() => setSessionType("endless")}>{text.endless}</button>
          </div>
        </fieldset>
        <fieldset className="leaderboard-filter-group">
          <legend>{labels.range}</legend>
          <div className="leaderboard-segments leaderboard-segments--levels">
            {(Object.keys(labels.levels) as PracticeLevel[]).map((item) => (
              <button key={item} type="button" aria-pressed={level === item} onClick={() => setLevel(item)}>{labels.levels[item]}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="leaderboard-filter-group">
          <legend>{labels.question}</legend>
          <div className="leaderboard-segments leaderboard-segments--two">
            <button type="button" aria-pressed={questionMode === "porte"} onClick={() => setQuestionMode("porte")}>{text.staff}</button>
            <button type="button" aria-pressed={questionMode === "konum"} onClick={() => setQuestionMode("konum")}>{text.position}</button>
          </div>
        </fieldset>
      </aside>
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
      <button type="button" aria-haspopup="dialog" onClick={() => openPanel("leaderboard")}>{text.leaderboard}</button>
      <button type="button" aria-haspopup="dialog" onClick={() => openPanel(user ? "account" : "auth")}>{profile ? `@${profile.username}` : user ? text.account : text.signIn}</button>
    </div>
  );
}

export function CommunityLeaderboardButton({ label }: { label: string }) {
  const { openPanel } = useCommunity();
  return <button className="secondary-button leaderboard-result-button" type="button" aria-haspopup="dialog" onClick={() => openPanel("leaderboard")}>{label}</button>;
}

const STREAK_COPY = {
  tr: {
    eyebrow: "Günlük çalışma",
    title: (count: number) => count > 0 ? `${count} günlük seri` : "İlk serini başlat",
    loading: "Seri yükleniyor…",
    guestTitle: "Günlük serini kaydet",
    guestCopy: "Giriş yaptıktan sonra tamamladığın çalışma günleri hesabında saklanır.",
    signIn: "Giriş yap",
    todayComplete: "Bugünkü çalışma kaydedildi.",
    continue: (count: number) => count > 0 ? `${count} günlük serini bugün sürdür.` : "Bugün bir oturum tamamla; ilk günün kaydedilsin.",
    longest: (count: number) => `En iyi seri: ${count} gün`,
    week: "Bu hafta",
    completedDay: "çalışma tamamlandı",
    openDay: "henüz çalışma yok",
    error: "Seri şu anda yüklenemedi. Çalışmana devam edebilirsin.",
    retry: "Tekrar dene",
  },
  en: {
    eyebrow: "Daily practice",
    title: (count: number) => count > 0 ? `${count}-day streak` : "Start your first streak",
    loading: "Loading your streak…",
    guestTitle: "Save your daily streak",
    guestCopy: "Practice days completed after sign-in are kept with your account.",
    signIn: "Sign in",
    todayComplete: "Today’s practice is recorded.",
    continue: (count: number) => count > 0 ? `Keep your ${count}-day streak going today.` : "Complete a session today to record day one.",
    longest: (count: number) => `Best streak: ${count} ${count === 1 ? "day" : "days"}`,
    week: "This week",
    completedDay: "practice completed",
    openDay: "no practice yet",
    error: "Your streak is unavailable right now. You can keep practising.",
    retry: "Try again",
  },
} as const;

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentWeek(locale: Locale) {
  const region = locale === "tr" ? "tr-TR" : "en-GB";
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      key: localDateKey(date),
      short: date.toLocaleDateString(region, { weekday: "short" }).replace(".", "").toLocaleUpperCase(region),
      full: date.toLocaleDateString(region, { weekday: "long", day: "numeric", month: "long" }),
      today: localDateKey(date) === localDateKey(today),
    };
  });
}

export function CommunityPracticeRecorder({ active, activityKey }: { active: boolean; activityKey: string }) {
  const { authReady, user, recordPracticeCompletion } = useCommunity();
  const recordedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !authReady || !user || recordedKey.current === activityKey) return;
    let cancelled = false;
    void recordPracticeCompletion().then((recorded) => {
      if (!cancelled && recorded) recordedKey.current = activityKey;
    });
    return () => {
      cancelled = true;
    };
  }, [active, activityKey, authReady, recordPracticeCompletion, user]);

  return null;
}

export function CommunityPracticeStreak({ compact = false }: { compact?: boolean }) {
  const {
    locale,
    user,
    authReady,
    streak,
    streakLoading,
    streakError,
    openPanel,
    refreshPracticeStreak,
  } = useCommunity();
  const titleId = useId();
  const copy = STREAK_COPY[locale];

  if (!authReady || (user && streakLoading && !streak)) {
    return (
      <section className={`practice-streak-card ${compact ? "practice-streak-card--compact" : ""}`} aria-labelledby={titleId} aria-busy="true">
        <p className="kicker">{copy.eyebrow}</p>
        <h2 id={titleId}>{copy.loading}</h2>
      </section>
    );
  }

  if (!user) {
    return (
      <section className={`practice-streak-card practice-streak-card--guest ${compact ? "practice-streak-card--compact" : ""}`} aria-labelledby={titleId}>
        <div>
          <p className="kicker">{copy.eyebrow}</p>
          <h2 id={titleId}>{copy.guestTitle}</h2>
          <p>{copy.guestCopy}</p>
        </div>
        <button className="secondary-button" type="button" aria-haspopup="dialog" onClick={() => openPanel("auth")}>{copy.signIn}</button>
      </section>
    );
  }

  if (streakError && !streak) {
    return (
      <section className={`practice-streak-card practice-streak-card--error ${compact ? "practice-streak-card--compact" : ""}`} aria-labelledby={titleId}>
        <div>
          <p className="kicker">{copy.eyebrow}</p>
          <h2 id={titleId}>{copy.error}</h2>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshPracticeStreak()}>{copy.retry}</button>
      </section>
    );
  }

  if (!streak) return null;

  const completedDates = new Set(streak.activeDates);
  const week = currentWeek(locale);
  return (
    <section className={`practice-streak-card ${compact ? "practice-streak-card--compact" : ""}`} aria-labelledby={titleId} aria-busy={streakLoading}>
      <div className="practice-streak-summary">
        <p className="kicker">{copy.eyebrow}</p>
        <h2 id={titleId}>{copy.title(streak.currentStreak)}</h2>
        <p className="practice-streak-status" aria-live="polite">{streak.todayCompleted ? copy.todayComplete : copy.continue(streak.currentStreak)}</p>
        {streak.longestStreak > 0 && <small>{copy.longest(streak.longestStreak)}</small>}
      </div>
      <div className="practice-week">
        <span>{copy.week}</span>
        <ol>
          {week.map((day) => {
            const completed = completedDates.has(day.key);
            return (
              <li key={day.key} className={completed ? "is-complete" : ""} aria-current={day.today ? "date" : undefined}>
                <span className="practice-day-mark" aria-hidden="true">{completed ? "✓" : ""}</span>
                <b aria-hidden="true">{day.short}</b>
                <span className="sr-only">{day.full}: {completed ? copy.completedDay : copy.openDay}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
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
    <div className={`community-result-card ${eligible ? "" : "community-result-card--ineligible"}`}>
      <div>
        <p className="kicker">{text.leaderboard}</p>
        <strong>{eligible && !user ? text.guestScoreTitle : eligible ? text.saveScore : eligibilityCopy}</strong>
        {eligible && !user && <p className="community-result-note">{text.guestScoreCopy}</p>}
        {!eligible && <p className="community-result-encouragement">{text.ineligibleEncouragement}</p>}
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
  return <button className="footer-link" type="button" aria-haspopup="dialog" onClick={() => openPanel("legal")}>{locale === "tr" ? `${text.privacy} ve ${text.legal}` : `${text.privacy} and ${text.legal}`}</button>;
}

function LegalNotice({ locale }: { locale: Locale }) {
  const isTurkish = locale === "tr";
  return (
    <article className="legal-copy">
      <p className="legal-updated">{isTurkish ? "Son güncelleme: 26 Temmuz 2026" : "Last updated: 26 July 2026"}</p>
      <h3>{isTurkish ? "Veri sorumlusu" : "Data controller"}</h3>
      <p>Alper Ferit Koç, kvkk@notanota.online</p>
      <h3>{isTurkish ? "İşlenen veriler ve amaçlar" : "Data and purposes"}</h3>
      <p>{isTurkish ? "E-posta adresi yalnızca şifresiz hesap doğrulaması ve hesap güvenliği için; 3–7 karakterli kullanıcı adı ile en iyi oturum skorları leaderboard için işlenir. Tamamlanan çalışma günleri ve tarayıcının bildirdiği saat dilimi, özel günlük seri ve devamlılık istatistiklerini hesaplamak için saklanır. E-posta ve günlük seri verileri leaderboard’da yayımlanmaz. Hizmet reklam veya pazarlama profili oluşturmaz." : "Email is processed only for passwordless account verification and account security. A 3–7 character username and personal-best session scores are processed for the leaderboard. Completed practice dates and the browser-reported time zone are stored to calculate private daily-streak and consistency statistics. Email and streak data are never published on the leaderboard. The service does not build advertising or marketing profiles."}</p>
      <h3>{isTurkish ? "Toplama yöntemi, hukuki sebep ve aktarım" : "Collection, legal basis, and transfers"}</h3>
      <p>{isTurkish ? "Veriler hesap oluşturma ve çalışma oturumları sırasında elektronik olarak toplanır. Hesap, günlük seri ve leaderboard işlevleri hizmetin kurulması/ifası; hesap güvenliği kayıtları ise hizmet güvenliğine ilişkin meşru menfaat kapsamında işlenir. Kimlik doğrulama ve veritabanı hizmetleri Supabase, e-posta teslimi Resend üzerinden yürütülür. Bu sağlayıcılar verileri yurt dışında işleyebilir. Aktarımın dayanağı ve uygulanan güvenceler hakkında ayrıntı istemek için kvkk@notanota.online adresine yazabilirsin." : "Data is collected electronically during account creation and practice sessions. Account, daily-streak and leaderboard features are processed to provide the service; account-security records are processed for the legitimate interest of keeping the service secure. Authentication and database services are provided by Supabase, and email is delivered through Resend. These providers may process data outside Türkiye. You can ask for details about the transfer basis and safeguards at kvkk@notanota.online."}</p>
      <h3>{isTurkish ? "Saklama ve güvenlik" : "Retention and security"}</h3>
      <p>{isTurkish ? "Hesap, kullanıcı adı, kişisel rekorlar ve tamamlanan çalışma günleri hesap silinene kadar saklanır; hesap silindiğinde seri kayıtları da silinir. Tek kullanımlık giriş bağlantıları kısa süreli ve tek kullanımlıdır. E-posta adresleri satılmaz; reklam veya pazarlama amacıyla paylaşılmaz. Güvenli girişin sağlanması için yalnızca Supabase ve yapılandırılan e-posta teslim sağlayıcısı tarafından işlenir. Zorunlu oturum verileri dışında takip/analiz çerezi kullanılmaz." : "The account, username, personal-best scores and completed practice dates are retained until the account is deleted; streak records are deleted with the account. Sign-in links are short-lived and single-use. Email addresses are never sold or shared for advertising or marketing. They are processed only by Supabase and the configured email delivery provider to provide secure sign-in. No tracking or analytics cookies are used beyond essential authentication storage."}</p>
      <h3>{isTurkish ? "Haklar ve başvuru" : "Rights and requests"}</h3>
      <p>{isTurkish ? "Hesabını ve ilişkili kayıtlarını Hesabım panelinden kendin silebilirsin. Ayrıca KVKK madde 11 kapsamındaki erişim, düzeltme, silme, işleme ve aktarıma ilişkin bilgi alma ile itiraz hakların için hesabında kayıtlı e-posta adresinden kvkk@notanota.online adresine başvurabilirsin. Başvurular talebin niteliğine göre en kısa sürede ve en geç 30 gün içinde sonuçlandırılır." : "You can delete your account and related records yourself from the Account panel. You may also contact kvkk@notanota.online from the email address registered to your account regarding access, correction, deletion, processing and transfer information, and objection rights under KVKK Article 11. Requests are answered as soon as possible and no later than 30 days, depending on their nature."}</p>
    </article>
  );
}
