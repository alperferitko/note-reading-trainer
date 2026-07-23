import { supabase } from "./supabase";

export type PracticeStreak = {
  currentStreak: number;
  longestStreak: number;
  todayCompleted: boolean;
  lastPracticeDate: string | null;
  activeDates: string[];
};

type PracticeStreakRow = {
  current_streak: number;
  longest_streak: number;
  today_completed: boolean;
  last_practice_date: string | null;
  active_dates: string[] | null;
};

function client() {
  if (!supabase) throw new Error("community_not_configured");
  return supabase;
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function normalizeStreak(data: unknown): PracticeStreak {
  const row = (Array.isArray(data) ? data[0] : data) as PracticeStreakRow | null;
  if (!row) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      todayCompleted: false,
      lastPracticeDate: null,
      activeDates: [],
    };
  }

  return {
    currentStreak: Number(row.current_streak) || 0,
    longestStreak: Number(row.longest_streak) || 0,
    todayCompleted: Boolean(row.today_completed),
    lastPracticeDate: row.last_practice_date ?? null,
    activeDates: Array.isArray(row.active_dates) ? row.active_dates.map(String) : [],
  };
}

export async function getMyPracticeStreak(): Promise<PracticeStreak> {
  const { data, error } = await client().rpc("get_my_practice_streak", {
    p_timezone: browserTimeZone(),
  });

  if (error) throw error;
  return normalizeStreak(data);
}

export async function recordPracticeDay(): Promise<PracticeStreak> {
  const { data, error } = await client().rpc("record_practice_day", {
    p_timezone: browserTimeZone(),
  });

  if (error) throw error;
  return normalizeStreak(data);
}
