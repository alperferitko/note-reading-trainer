import { supabase } from "./supabase";

export type SessionType = "standard" | "endless";
export type PracticeLevel = "temel" | "yakin" | "tam";
export type QuestionMode = "porte" | "konum";

export type Profile = {
  username: string;
};

export type ScoreSubmission = {
  sessionType: SessionType;
  level: PracticeLevel;
  questionMode: QuestionMode;
  correctCount: number;
  wrongCount: number;
  totalResponseTimeMs: number;
};

export type LeaderboardRow = {
  rank: number;
  username: string;
  correct_count: number;
  total_response_time_ms: number;
  average_response_time_ms: number;
  achieved_at: string;
};

function client() {
  if (!supabase) throw new Error("community_not_configured");
  return supabase;
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await client()
    .from("profiles")
    .select("username")
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export async function claimUsername(username: string): Promise<string> {
  const { data, error } = await client().rpc("claim_username", {
    p_username: username,
  });

  if (error) throw error;
  return String(data);
}

export async function submitBestScore(score: ScoreSubmission) {
  const { data, error } = await client().rpc("submit_best_score", {
    p_session_type: score.sessionType,
    p_level: score.level,
    p_question_mode: score.questionMode,
    p_correct_count: score.correctCount,
    p_wrong_count: score.wrongCount,
    p_total_response_time_ms: score.totalResponseTimeMs,
  });

  if (error) throw error;
  return String(data) as "saved" | "not_better" | "ineligible";
}

export async function getLeaderboard(
  sessionType: SessionType,
  level: PracticeLevel,
  questionMode: QuestionMode,
): Promise<LeaderboardRow[]> {
  const { data, error } = await client().rpc("get_leaderboard", {
    p_session_type: sessionType,
    p_level: level,
    p_question_mode: questionMode,
    p_limit: 50,
  });

  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}
