// Streaks are a light, optional motivator. Missing a day simply restarts the
// count; we never deduct XP or lock content for a pause.
export type StreakState = { current_days: number; best_days: number; last_qualified_date: string | null };

/** Calendar date (YYYY-MM-DD) in the learner's timezone. */
export function localDate(at: Date, timeZone = "Asia/Ulaanbaatar"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function nextStreak(prev: StreakState | null, today: string): StreakState {
  if (!prev || !prev.last_qualified_date) return { current_days: 1, best_days: Math.max(1, prev?.best_days ?? 0), last_qualified_date: today };
  const diff = dayDiff(prev.last_qualified_date, today);
  if (diff <= 0) return prev; // same day (or clock skew): unchanged
  const current = diff === 1 ? prev.current_days + 1 : 1;
  return { current_days: current, best_days: Math.max(prev.best_days, current), last_qualified_date: today };
}
