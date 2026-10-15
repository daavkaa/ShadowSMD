import { beforeEach, describe, expect, it } from "vitest";
import { completeLesson, getCourseMap, getLessonForPlayer, submitStep, submitReview, listDueReviews } from "@/features/learning/service";
import { resetRateLimits } from "@/lib/security/rate-limit";
import { admin, correctAnswerFor, createUser, ids, stepsOf, wrongAnswerFor } from "../support/db";
import { finishLesson } from "../support/flows";

beforeEach(() => resetRateLimits());

describe("free learning path", () => {
  it("new learner sees 3 free levels, premium gates and the exam node", async () => {
    const u = await createUser();
    const map = (await getCourseMap(u.id, "smm-foundations"))!;
    expect(map.nodes.map((n) => n.state)).toEqual(["current", "locked", "locked", "premium_locked", "premium_locked", "premium_locked"]);
    expect(map.totalLevels).toBe(6);
    expect(map.hasPremium).toBe(false);
  });

  it("scores on the server, awards XP once, requires all steps, unlocks the next level", async () => {
    const u = await createUser();
    const [l1, l2] = await ids.lessons();
    const steps = await stepsOf(l1!.id);
    const q = steps.find((s) => s.kind === "single_choice")!;

    const wrong = await submitStep(u.id, q.id, await wrongAnswerFor(q.id));
    expect(wrong).toMatchObject({ correct: false, attemptNo: 1, xpAwarded: 0, correctAnswer: null });
    const right = await submitStep(u.id, q.id, await correctAnswerFor(q.id));
    expect(right).toMatchObject({ correct: true, attemptNo: 2, xpAwarded: 5 });
    const again = await submitStep(u.id, q.id, await correctAnswerFor(q.id));
    expect(again.xpAwarded).toBe(0); // XP is granted once per step

    await expect(completeLesson(u.id, l1!.id)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(getLessonForPlayer(u.id, l2!.id)).rejects.toMatchObject({ code: "prerequisite_incomplete" });

    const res = await finishLesson(u.id, l1!.id);
    expect(res.scorePct).toBeLessThan(100); // first-try miss counts against the lesson score
    expect(res.xpAwarded).toBe(20);
    expect(res.streak.current_days).toBe(1);
    const again2 = await completeLesson(u.id, l1!.id);
    expect(again2.xpAwarded).toBe(0);

    const player = await getLessonForPlayer(u.id, l2!.id);
    expect(player.steps.length).toBeGreaterThan(0);
    const map = (await getCourseMap(u.id, "smm-foundations"))!;
    expect(map.nodes.slice(0, 2).map((n) => n.state)).toEqual(["completed", "current"]);
  });

  it("missed questions enter the review queue and can be reviewed when due", async () => {
    const u = await createUser();
    const [l1] = await ids.lessons();
    const q = (await stepsOf(l1!.id)).find((s) => s.kind === "single_choice")!;
    await submitStep(u.id, q.id, await wrongAnswerFor(q.id));
    expect(await listDueReviews(u.id)).toHaveLength(0);
    const future = new Date(Date.now() + 2 * 86_400_000);
    const due = await listDueReviews(u.id, future);
    expect(due.map((d) => d.step_id)).toContain(q.id);
    await expect(submitReview(u.id, q.id, await correctAnswerFor(q.id))).rejects.toMatchObject({ code: "conflict" });
    const r = await submitReview(u.id, q.id, await correctAnswerFor(q.id), future);
    expect(r.correct).toBe(true);
    expect(r.xpAwarded).toBe(5);
  });

  it("rejects malformed answers without recording attempts", async () => {
    const u = await createUser();
    const [l1] = await ids.lessons();
    const q = (await stepsOf(l1!.id)).find((s) => s.kind === "multi_choice")!;
    await expect(submitStep(u.id, q.id, { choices: "a" })).rejects.toThrow();
    const [{ n }] = (await admin<{ n: number }[]>`select count(*)::int as n from public.step_responses where user_id = ${u.id}`) as unknown as [{ n: number }];
    expect(n).toBe(0);
  });
});

describe("premium lock (raw URL / API access)", () => {
  it("free learner cannot load or submit premium steps even after finishing free levels", async () => {
    const u = await createUser();
    const lessons = await ids.lessons();
    for (const l of lessons.filter((x) => x.access_tier === "free")) await finishLesson(u.id, l.id);
    const premium = lessons.find((l) => l.access_tier === "premium")!;
    await expect(getLessonForPlayer(u.id, premium.id)).rejects.toMatchObject({ code: "premium_required" });
    const [step] = await stepsOf(premium.id);
    await expect(submitStep(u.id, step!.id, await correctAnswerFor(step!.id))).rejects.toMatchObject({ code: "premium_required" });
    await expect(completeLesson(u.id, premium.id)).rejects.toMatchObject({ code: "premium_required" });
  });
});
