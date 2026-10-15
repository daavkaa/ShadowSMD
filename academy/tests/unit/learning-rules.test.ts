import { describe, expect, it } from "vitest";
import { localDate, nextStreak } from "@/features/learning/streak";
import { scheduleReview } from "@/features/learning/review";
import { computeNodeStates } from "@/features/learning/service";

describe("streaks (non-punitive)", () => {
  it("starts, continues, survives same-day repeats and restarts after a gap", () => {
    const s1 = nextStreak(null, "2026-10-15");
    expect(s1).toEqual({ current_days: 1, best_days: 1, last_qualified_date: "2026-10-15" });
    expect(nextStreak(s1, "2026-10-15")).toEqual(s1);
    const s2 = nextStreak(s1, "2026-10-16");
    expect(s2.current_days).toBe(2);
    const s3 = nextStreak(s2, "2026-10-20");
    expect(s3).toEqual({ current_days: 1, best_days: 2, last_qualified_date: "2026-10-20" });
  });
  it("uses the learner's timezone for day boundaries", () => {
    // 2026-10-15 17:30Z is already 2026-10-16 01:30 in Ulaanbaatar (UTC+8)
    expect(localDate(new Date("2026-10-15T17:30:00Z"))).toBe("2026-10-16");
    expect(localDate(new Date("2026-10-15T17:30:00Z"), "UTC")).toBe("2026-10-15");
  });
});

describe("spaced review", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  it("schedules 1 → 3 → 7 days, then grows by ease, capped", () => {
    let s = scheduleReview(null, true, now);
    expect(s.interval_days).toBe(1);
    s = scheduleReview(s, true, now);
    expect(s.interval_days).toBe(3);
    s = scheduleReview(s, true, now);
    expect(s.interval_days).toBe(7);
    s = scheduleReview(s, true, now);
    expect(s.interval_days).toBeGreaterThan(7);
    let big = { ...s, interval_days: 59 };
    expect(scheduleReview(big, true, now).interval_days).toBe(60);
  });
  it("a miss resets to 1 day and counts a lapse", () => {
    const s = scheduleReview({ interval_days: 7, ease: 2.3, repetitions: 3, lapses: 0 }, false, now);
    expect(s).toMatchObject({ interval_days: 1, repetitions: 0, lapses: 1 });
    expect(s.next_review_at.toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });
});

describe("learning map node states", () => {
  const L = (id: string, tier: "free" | "premium", accessible: boolean, prereqs: string[] = []) => ({ id, access_tier: tier, accessible, prereqs });
  it("free learner: first incomplete is current, later locked, premium gated", () => {
    const states = computeNodeStates([L("1", "free", true), L("2", "free", true, ["1"]), L("3", "free", true, ["2"]), L("4", "premium", false, ["3"])], new Set(["1"]));
    expect(states).toEqual(["completed", "current", "locked", "premium_locked"]);
  });
  it("premium learner who finished everything", () => {
    expect(computeNodeStates([L("1", "free", true), L("2", "premium", true, ["1"])], new Set(["1", "2"]))).toEqual(["completed", "completed"]);
  });
});
