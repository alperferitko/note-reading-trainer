// The learner's goals and preferences, kept with their account (public.learning_profiles, owner-only).
// They shape the AI teacher's starter plan; the user can change or clear them at any time.
import { communityConfigured, supabase } from './supabase';

export type LearningProfile = {
  purpose: 'hobby' | 'detailed' | null;
  instrument: 'piano' | 'guitar' | 'violin' | 'voice' | 'flute' | 'other' | 'none' | null;
  level: 'none' | 'beginner' | 'some' | 'reads' | null;
  weeklyMinutes: number | null;
  interests: string | null;
  timezone: string | null;
};

/** On only where the table exists (the staging build). */
export const learningProfileEnabled = communityConfigured && import.meta.env.VITE_LEARNING_PROFILE === 'true';

export const EMPTY_PROFILE: LearningProfile = { purpose: null, instrument: null, level: null, weeklyMinutes: null, interests: null, timezone: null };

export function localTimezone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

export async function loadProfile(): Promise<LearningProfile | null> {
  if (!learningProfileEnabled || !supabase) return null;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const { data, error } = await supabase.from('learning_profiles').select('purpose,instrument,level,weekly_minutes,interests,timezone').maybeSingle();
  if (error) throw new Error('profile_unavailable');
  if (!data) return { ...EMPTY_PROFILE, timezone: localTimezone() };
  return { purpose: data.purpose, instrument: data.instrument, level: data.level, weeklyMinutes: data.weekly_minutes, interests: data.interests, timezone: data.timezone ?? localTimezone() };
}

export async function saveProfile(profile: LearningProfile): Promise<void> {
  if (!learningProfileEnabled || !supabase) throw new Error('profile_unavailable');
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('sign_in_required');
  const interests = profile.interests?.trim().slice(0, 120) || null;
  const minutes = profile.weeklyMinutes === null ? null : Math.max(0, Math.min(1200, Math.round(profile.weeklyMinutes)));
  const { error } = await supabase.from('learning_profiles').upsert({
    user_id: userId, purpose: profile.purpose, instrument: profile.instrument, level: profile.level,
    weekly_minutes: minutes, interests, timezone: profile.timezone ?? localTimezone(),
  }, { onConflict: 'user_id' });
  if (error) throw new Error('profile_save_failed');
}

/** Only the fields the teacher may see, without nulls. */
export function profileForTeacher(profile: LearningProfile | null) {
  if (!profile) return null;
  const out: Record<string, unknown> = {};
  if (profile.purpose) out.purpose = profile.purpose;
  if (profile.instrument) out.instrument = profile.instrument;
  if (profile.level) out.level = profile.level;
  if (profile.weeklyMinutes !== null) out.weeklyMinutes = profile.weeklyMinutes;
  if (profile.interests) out.interests = profile.interests;
  return Object.keys(out).length ? out : null;
}
