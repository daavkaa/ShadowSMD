// Spaced review scheduling (experimental default 1d → 3d → 7d → ×ease, cap 60d).
// These intervals are a starting hypothesis to be tuned with learner data.
export type ReviewState = { interval_days: number; ease: number; repetitions: number; lapses: number };

const LADDER = [1, 3, 7];
const MAX_INTERVAL = 60;

export function scheduleReview(prev: ReviewState | null, correct: boolean, now: Date): ReviewState & { next_review_at: Date } {
  const base: ReviewState = prev ?? { interval_days: 0, ease: 2.3, repetitions: 0, lapses: 0 };
  let next: ReviewState;
  if (!correct) {
    next = { interval_days: 1, ease: Math.max(1.3, +(base.ease - 0.2).toFixed(2)), repetitions: 0, lapses: base.lapses + (prev ? 1 : 0) };
  } else {
    const reps = base.repetitions + 1;
    const interval = reps <= LADDER.length ? LADDER[reps - 1]! : Math.min(MAX_INTERVAL, Math.round(base.interval_days * base.ease));
    next = { interval_days: interval, ease: Math.min(3.0, +(base.ease + 0.05).toFixed(2)), repetitions: reps, lapses: base.lapses };
  }
  return { ...next, next_review_at: new Date(now.getTime() + next.interval_days * 86_400_000) };
}
