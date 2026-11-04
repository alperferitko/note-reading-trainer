"use client";

import { useEffect, useState } from "react";
import { WeekPlanView } from "./chat-ui";
import { EMPTY_PROFILE, learningProfileEnabled, loadProfile, localTimezone, saveProfile, type LearningProfile } from "@/lib/learning-profile";

type Locale = "tr" | "en";
const T = {
  tr: {
    title: "Öğrenme hedeflerim", help: "NotaNota AI başlangıç planını ve önerilerini bunlara göre kurar. Hesabına kaydedilir; istediğin zaman değiştirebilir ya da boş bırakabilirsin.",
    signIn: "Hedeflerini kaydetmek için giriş yap.", purpose: "Amacın", instrument: "Enstrüman", level: "Nota bilgin", minutes: "Haftada ayırabileceğin süre (dakika)", interests: "Çalmak istediğin eser ya da tarz",
    purposes: { hobby: "Hobi olarak", detailed: "Ayrıntılı eğitim" }, levels: { none: "Hiç bilmiyorum", beginner: "Yeni başladım", some: "Biraz okuyabiliyorum", reads: "Rahat okuyorum" },
    instruments: { piano: "Piyano", guitar: "Gitar", violin: "Keman", voice: "Ses", flute: "Flüt", other: "Diğer", none: "Henüz yok" },
    plan: "Haftalık planın", clearPlan: "Planı kaldır", noPlan: "Henüz kayıtlı bir plan yok. NotaNota AI sohbetinde hedeflerini konuşunca haftanı günlere bölen bir plan önerir.",
    save: "Kaydet", saved: "Kaydedildi.", failed: "Kaydedilemedi; biraz sonra tekrar dene.", unset: "Belirtmedim", timezone: (z: string) => `Haftalık raporlar ${z} saatine göre hesaplanır.`,
  },
  en: {
    title: "My learning goals", help: "NotaNota AI builds its starter plan and suggestions from these. They are saved to your account; change or clear them any time.",
    signIn: "Sign in to save your goals.", purpose: "Your aim", instrument: "Instrument", level: "Reading music", minutes: "Time per week (minutes)", interests: "Pieces or styles you want to play",
    purposes: { hobby: "As a hobby", detailed: "Thorough study" }, levels: { none: "Not at all", beginner: "Just started", some: "A little", reads: "Comfortably" },
    instruments: { piano: "Piano", guitar: "Guitar", violin: "Violin", voice: "Voice", flute: "Flute", other: "Other", none: "None yet" },
    plan: "Your weekly plan", clearPlan: "Remove the plan", noPlan: "No plan saved yet. Talk about your goals in the NotaNota AI chat and it proposes a week split into days.",
    save: "Save", saved: "Saved.", failed: "Could not save; try again in a moment.", unset: "Not set", timezone: (z: string) => `Weekly reports follow ${z} time.`,
  },
} as const;

/** Settings section: the goals the AI teacher plans from. Shown only where the profile table exists. */
export function LearningGoals({ locale }: { locale: Locale }) {
  const t = T[locale];
  const [profile, setProfile] = useState<LearningProfile | null | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!learningProfileEnabled) return;
    let alive = true;
    loadProfile().then((value) => { if (alive) setProfile(value); }).catch(() => alive && setProfile(null));
    return () => { alive = false; };
  }, []);
  if (!learningProfileEnabled) return null;
  const p = profile ?? EMPTY_PROFILE;
  const set = (patch: Partial<LearningProfile>) => { setProfile({ ...p, ...patch }); setStatus(null); };
  return (
    <section className="settings-section" aria-labelledby="settings-goals">
      <h2 id="settings-goals">{t.title}</h2>
      <p className="settings-help">{t.help}</p>
      {profile === null && <p className="settings-help">{t.signIn}</p>}
      {profile && (
        <form className="settings-goals" onSubmit={async (event) => {
          event.preventDefault();
          try { await saveProfile({ ...p, timezone: p.timezone ?? localTimezone() }); setStatus(t.saved); } catch { setStatus(t.failed); }
        }}>
          <label>{t.purpose}<select value={p.purpose ?? ""} onChange={(e) => set({ purpose: (e.target.value || null) as LearningProfile["purpose"] })}>
            <option value="">{t.unset}</option>{Object.entries(t.purposes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>{t.instrument}<select value={p.instrument ?? ""} onChange={(e) => set({ instrument: (e.target.value || null) as LearningProfile["instrument"] })}>
            <option value="">{t.unset}</option>{Object.entries(t.instruments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>{t.level}<select value={p.level ?? ""} onChange={(e) => set({ level: (e.target.value || null) as LearningProfile["level"] })}>
            <option value="">{t.unset}</option>{Object.entries(t.levels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>{t.minutes}<input type="number" min={0} max={1200} step={10} value={p.weeklyMinutes ?? ""} onChange={(e) => set({ weeklyMinutes: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label className="settings-goals-wide">{t.interests}<input maxLength={120} value={p.interests ?? ""} onChange={(e) => set({ interests: e.target.value || null })} /></label>
          {p.timezone && <p className="settings-help settings-goals-wide">{t.timezone(p.timezone)}</p>}
          <div className="settings-goals-wide settings-goals-plan">
            <span>{t.plan}</span>
            {p.weekPlan ? <><WeekPlanView days={p.weekPlan} locale={locale} /><button type="button" className="ghost-button" onClick={() => set({ weekPlan: null })}>{t.clearPlan}</button></> : <p className="settings-help">{t.noPlan}</p>}
          </div>
          <div className="settings-row-actions settings-goals-wide"><button type="submit" className="primary-button">{t.save}</button>{status && <p role="status">{status}</p>}</div>
        </form>
      )}
    </section>
  );
}
