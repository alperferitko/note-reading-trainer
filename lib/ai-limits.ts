/**
 * What the learner reads when the gateway's ledger refuses a request, one line per limit
 * (see the scopes in supabase/migrations/202611040004_ai_free_trial.sql). Shared by every AI surface.
 */
export const AI_LIMIT_REASONS: Record<string, [string, string]> = {
  rate_limited: ["Biraz hızlı gittik; bir dakika sonra tekrar dene.", "That was a little fast; try again in a minute."],
  quota_exceeded: ["Bugünkü NotaNota AI hakkın doldu; yarın yenilenir.", "Today's NotaNota AI allowance is used up; it renews tomorrow."],
  trial_quota_exceeded: ["Ücretsiz denemedeki NotaNota AI hakkının tamamını kullandın.", "You have used all of your free-trial NotaNota AI allowance."],
  trial_ended: ["3 günlük ücretsiz NotaNota AI denemen sona erdi. Çalışmalar ve kural tabanlı yorumlar açık kalır.", "Your 3-day free NotaNota AI trial has ended. Practice and rule-based feedback stay available."],
  service_busy: ["NotaNota AI şu an çok yoğun; biraz sonra tekrar dene.", "NotaNota AI is very busy right now; try again a little later."],
};
