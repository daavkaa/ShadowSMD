import "server-only";
import { withService, withUser, type Tx } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { LESSON_COMPLETE_XP, REVIEW_XP, SCORED_KINDS, scoreStep, xpForStep, type StepKind } from "./scoring";
import { localDate, nextStreak, type StreakState } from "./streak";
import { scheduleReview } from "./review";

export type NodeState = "completed" | "current" | "available" | "locked" | "premium_locked";

export type MapNode = {
  kind: "lesson" | "exam";
  id: string;
  title: string;
  summary: string;
  level: number;
  access_tier: "free" | "premium";
  state: NodeState;
};

export type CourseMap = {
  course: { id: string; slug: string; title: string };
  nodes: MapNode[];
  completedLevels: number;
  totalLevels: number;
  hasPremium: boolean;
  certified: boolean;
};

/** Lesson unlock rule shared by map and server enforcement. */
export function computeNodeStates(
  lessons: { id: string; access_tier: "free" | "premium"; accessible: boolean; prereqs: string[] }[],
  completed: ReadonlySet<string>,
): NodeState[] {
  let currentAssigned = false;
  return lessons.map((l) => {
    if (completed.has(l.id)) return "completed";
    const prereqsDone = l.prereqs.every((p) => completed.has(p));
    if (!l.accessible) return "premium_locked";
    if (!prereqsDone) return "locked";
    if (!currentAssigned) {
      currentAssigned = true;
      return "current";
    }
    return "available";
  });
}

export async function getCourseMap(userId: string | null, courseSlug: string): Promise<CourseMap | null> {
  return withUser(userId, async (tx) => {
    const [course] = await tx<{ id: string; slug: string; title: string }[]>`
      select id, slug, title from public.courses where slug = ${courseSlug} and status = 'published'`;
    if (!course) return null;
    const lessons = await tx<{ id: string; title: string; summary: string; sort_order: number; access_tier: "free" | "premium"; accessible: boolean; prereqs: string[] }[]>`
      select l.id, l.title, l.summary, l.sort_order, l.access_tier, public.can_access_lesson(l.id) as accessible,
             coalesce(array(select p.required_lesson_id::text from public.learning_prerequisites p where p.target_lesson_id = l.id), '{}') as prereqs
      from public.lessons l where l.course_id = ${course.id} order by l.sort_order`;
    const progress = userId
      ? await tx<{ lesson_id: string }[]>`select lesson_id from public.lesson_progress where user_id = ${userId} and status = 'completed'`
      : [];
    const completed = new Set(progress.map((p) => p.lesson_id));
    const states = computeNodeStates(lessons, completed);
    const hasPremium = lessons.some((l) => l.access_tier === "premium" && l.accessible);
    const [exam] = await tx<{ id: string; title: string }[]>`select id, title from public.assessments where course_id = ${course.id} and kind = 'final' and status = 'published'`;
    const [cred] = userId
      ? await tx<{ id: string }[]>`select id from public.credentials where user_id = ${userId} and course_id = ${course.id} and revoked_at is null`
      : [];
    const nodes: MapNode[] = lessons.map((l, i) => ({
      kind: "lesson",
      id: l.id,
      title: l.title,
      summary: l.summary,
      level: i + 1,
      access_tier: l.access_tier,
      state: states[i]!,
    }));
    if (exam) {
      const allDone = lessons.every((l) => completed.has(l.id));
      nodes.push({
        kind: "exam",
        id: exam.id,
        title: "Эцсийн сертификат",
        summary: "Эцсийн шалгалт ба баталгаажуулах боломжтой сертификат",
        level: lessons.length + 1,
        access_tier: "premium",
        state: cred ? "completed" : !hasPremium ? "premium_locked" : allDone ? (states.includes("current") ? "available" : "current") : "locked",
      });
    }
    return {
      course,
      nodes,
      completedLevels: nodes.filter((n) => n.state === "completed").length,
      totalLevels: nodes.length,
      hasPremium,
      certified: Boolean(cred),
    };
  });
}

export type PlayerStep = { id: string; kind: StepKind; sort_order: number; points: number; content: Record<string, unknown> };

export type PlayerLesson = {
  lesson: { id: string; title: string; course_id: string; course_slug: string; access_tier: "free" | "premium"; sort_order: number };
  steps: PlayerStep[];
  answered: Record<string, { correct: boolean | null; attempts: number }>;
};

/** Loads a lesson for the player. Step rows come through RLS, so premium content is unreadable without entitlement. */
export async function getLessonForPlayer(userId: string, lessonId: string): Promise<PlayerLesson> {
  return withUser(userId, async (tx) => {
    const [lesson] = await tx<PlayerLesson["lesson"][]>`
      select l.id, l.title, l.course_id, c.slug as course_slug, l.access_tier, l.sort_order
      from public.lessons l join public.courses c on c.id = l.course_id where l.id = ${lessonId}`;
    if (!lesson) throw new AppError("not_found");
    const [{ accessible } = { accessible: false }] = await tx<{ accessible: boolean }[]>`select public.can_access_lesson(${lessonId}) as accessible`;
    if (!accessible) throw new AppError("premium_required", "Premium access required", { courseSlug: lesson.course_slug });
    await assertPrerequisites(tx, userId, lessonId);
    const steps = await tx<PlayerStep[]>`
      select id, kind, sort_order, points, content from public.lesson_steps where lesson_id = ${lessonId} order by sort_order`;
    const responses = await tx<{ step_id: string; correct: boolean | null; attempts: number }[]>`
      select step_id, bool_or(is_correct) as correct, count(*)::int as attempts
      from public.step_responses where user_id = ${userId} and lesson_id = ${lessonId} group by step_id`;
    return { lesson, steps, answered: Object.fromEntries(responses.map((r) => [r.step_id, { correct: r.correct, attempts: r.attempts }])) };
  });
}

async function assertPrerequisites(tx: Tx, userId: string, lessonId: string) {
  const missing = await tx<{ required_lesson_id: string }[]>`
    select p.required_lesson_id from public.learning_prerequisites p
    where p.target_lesson_id = ${lessonId}
      and not exists (select 1 from public.lesson_progress lp where lp.user_id = ${userId} and lp.lesson_id = p.required_lesson_id and lp.status = 'completed')`;
  if (missing.length) throw new AppError("prerequisite_incomplete", "Complete previous levels first");
}

/** Server-side access check (service context) mirroring RLS. */
export async function assertLessonAccess(tx: Tx, userId: string, lesson: { id: string; course_id: string; access_tier: string; status: string }) {
  if (lesson.status !== "published") throw new AppError("not_found");
  if (lesson.access_tier === "premium") {
    const [{ ok } = { ok: false }] = await tx<{ ok: boolean }[]>`select public.has_premium_access(${userId}, ${lesson.course_id}) as ok`;
    if (!ok) throw new AppError("premium_required");
  }
  await assertPrerequisites(tx, userId, lesson.id);
}

export type SubmitResult = {
  correct: boolean | null;
  attemptNo: number;
  xpAwarded: number;
  explanation: string | null;
  correctAnswer: unknown | null;
};

const MAX_ATTEMPTS_PER_STEP = 10;

export async function submitStep(userId: string, stepId: string, rawAnswer: unknown, now = new Date()): Promise<SubmitResult> {
  rateLimit(`step:${userId}`, 60, 60_000);
  return withService(async (tx) => {
    const [step] = await tx<{ id: string; kind: StepKind; points: number; lesson_id: string; course_id: string; access_tier: string; status: string }[]>`
      select s.id, s.kind, s.points, s.lesson_id, l.course_id, l.access_tier, l.status
      from public.lesson_steps s join public.lessons l on l.id = s.lesson_id where s.id = ${stepId}`;
    if (!step) throw new AppError("not_found");
    await assertLessonAccess(tx, userId, { id: step.lesson_id, course_id: step.course_id, access_tier: step.access_tier, status: step.status });

    // Serialize submissions per user+lesson to get a race-free attempt number.
    await tx`insert into public.lesson_progress (user_id, lesson_id, last_step_id) values (${userId}, ${step.lesson_id}, ${stepId})
             on conflict (user_id, lesson_id) do update set last_step_id = excluded.last_step_id`;
    await tx`select 1 from public.lesson_progress where user_id = ${userId} and lesson_id = ${step.lesson_id} for update`;
    await tx`insert into public.enrollments (user_id, course_id) values (${userId}, ${step.course_id}) on conflict do nothing`;

    const [{ n }] = (await tx<{ n: number }[]>`select count(*)::int as n from public.step_responses where user_id = ${userId} and step_id = ${stepId}`) as unknown as [{ n: number }];
    if (n >= MAX_ATTEMPTS_PER_STEP) throw new AppError("rate_limited", "Too many attempts for this step");
    const attemptNo = n + 1;

    const [key] = await tx<{ answer: unknown; explanation: string }[]>`select answer, explanation from public.lesson_step_keys where step_id = ${stepId}`;
    const scored = SCORED_KINDS.has(step.kind);
    if (scored && !key) throw new Error(`step ${stepId} has no answer key`);
    const result = scoreStep(step.kind, key?.answer, rawAnswer);

    await tx`insert into public.step_responses (user_id, step_id, lesson_id, attempt_no, answer, is_correct, score)
             values (${userId}, ${stepId}, ${step.lesson_id}, ${attemptNo}, ${tx.json(result.normalized as never)}, ${result.correct},
                     ${xpForStep(step.points, attemptNo, result.correct)})`;

    let xpAwarded = 0;
    const xp = xpForStep(step.points, attemptNo, result.correct);
    if (xp > 0) {
      const ins = await tx`insert into public.xp_ledger (user_id, event_type, source_id, points) values (${userId}, 'step_correct', ${stepId}, ${xp})
                           on conflict do nothing returning id`;
      if (ins.length) xpAwarded = xp;
    }

    if (scored && attemptNo === 1) {
      // First-try mistakes enter the review queue; first-try successes are not scheduled.
      if (result.correct === false) {
        const s = scheduleReview(null, false, now);
        await tx`insert into public.review_items (user_id, step_id, next_review_at, interval_days, ease, repetitions, lapses)
                 values (${userId}, ${stepId}, ${s.next_review_at}, ${s.interval_days}, ${s.ease}, ${s.repetitions}, ${s.lapses})
                 on conflict (user_id, step_id) do nothing`;
      }
    }

    // Reveal the correct answer only after the first miss has been retried once (keeps retries meaningful).
    const reveal = scored && (result.correct === true || attemptNo >= 2);
    return {
      correct: result.correct,
      attemptNo,
      xpAwarded,
      explanation: key?.explanation ?? null,
      correctAnswer: reveal ? key?.answer ?? null : null,
    };
  });
}

export type CompleteResult = { scorePct: number; xpAwarded: number; streak: StreakState; nextLessonId: string | null; courseSlug: string };

export async function completeLesson(userId: string, lessonId: string, now = new Date()): Promise<CompleteResult> {
  return withService(async (tx) => {
    const [lesson] = await tx<{ id: string; course_id: string; access_tier: string; status: string; sort_order: number; course_slug: string }[]>`
      select l.id, l.course_id, l.access_tier, l.status, l.sort_order, c.slug as course_slug
      from public.lessons l join public.courses c on c.id = l.course_id where l.id = ${lessonId}`;
    if (!lesson) throw new AppError("not_found");
    await assertLessonAccess(tx, userId, lesson);

    const steps = await tx<{ id: string; kind: StepKind; points: number; ok: boolean; first_ok: boolean; answered: boolean }[]>`
      select s.id, s.kind, s.points,
             coalesce(bool_or(r.is_correct), false) as ok,
             coalesce(bool_or(r.is_correct) filter (where r.attempt_no = 1), false) as first_ok,
             count(r.id) > 0 as answered
      from public.lesson_steps s left join public.step_responses r on r.step_id = s.id and r.user_id = ${userId}
      where s.lesson_id = ${lessonId} group by s.id, s.kind, s.points`;
    const incomplete = steps.filter((s) => (SCORED_KINDS.has(s.kind) ? !s.ok : !s.answered));
    if (incomplete.length) throw new AppError("invalid_input", "All steps must be completed", { incompleteSteps: incomplete.map((s) => s.id) });

    const scoredSteps = steps.filter((s) => SCORED_KINDS.has(s.kind));
    const total = scoredSteps.reduce((a, s) => a + s.points, 0);
    const got = scoredSteps.filter((s) => s.first_ok).reduce((a, s) => a + s.points, 0);
    const scorePct = total ? Math.floor((got * 100) / total) : 100;

    await tx`insert into public.lesson_progress (user_id, lesson_id, status, completed_at, best_score_pct)
             values (${userId}, ${lessonId}, 'completed', ${now}, ${scorePct})
             on conflict (user_id, lesson_id) do update set
               status = 'completed',
               completed_at = coalesce(public.lesson_progress.completed_at, excluded.completed_at),
               best_score_pct = greatest(coalesce(public.lesson_progress.best_score_pct, 0), excluded.best_score_pct)`;

    let xpAwarded = 0;
    const ins = await tx`insert into public.xp_ledger (user_id, event_type, source_id, points) values (${userId}, 'lesson_complete', ${lessonId}, ${LESSON_COMPLETE_XP})
                         on conflict do nothing returning id`;
    if (ins.length) xpAwarded += LESSON_COMPLETE_XP;

    const streak = await bumpStreak(tx, userId, now);
    const [next] = await tx<{ id: string }[]>`
      select id from public.lessons where course_id = ${lesson.course_id} and sort_order > ${lesson.sort_order} and status = 'published' order by sort_order limit 1`;
    await tx`insert into public.product_events (user_id, event_name, properties) values (${userId}, 'lesson_completed', ${tx.json({ lesson_id: lessonId, score_pct: scorePct })})`;
    return { scorePct, xpAwarded, streak, nextLessonId: next?.id ?? null, courseSlug: lesson.course_slug };
  });
}

async function bumpStreak(tx: Tx, userId: string, now: Date): Promise<StreakState> {
  const [prof] = await tx<{ timezone: string }[]>`select timezone from public.profiles where id = ${userId}`;
  const tz = prof?.timezone ?? "Asia/Ulaanbaatar";
  const [prev] = await tx<StreakState[]>`
    select current_days, best_days, to_char(last_qualified_date, 'YYYY-MM-DD') as last_qualified_date from public.streaks where user_id = ${userId} for update`;
  const next = nextStreak(prev ?? null, localDate(now, tz));
  await tx`insert into public.streaks (user_id, current_days, best_days, last_qualified_date, timezone)
           values (${userId}, ${next.current_days}, ${next.best_days}, ${next.last_qualified_date}, ${tz})
           on conflict (user_id) do update set current_days = excluded.current_days, best_days = excluded.best_days,
             last_qualified_date = excluded.last_qualified_date`;
  return next;
}

// ───────── review center ─────────
export async function listDueReviews(userId: string, now = new Date()) {
  return withUser(userId, async (tx) => tx<{ step_id: string; kind: StepKind; content: Record<string, unknown>; lesson_title: string; next_review_at: Date; accessible: boolean }[]>`
    select r.step_id, s.kind, s.content, l.title as lesson_title, r.next_review_at, true as accessible
    from public.review_items r
    join public.lesson_steps s on s.id = r.step_id
    join public.lessons l on l.id = s.lesson_id
    where r.user_id = ${userId} and r.next_review_at <= ${now}
    order by r.next_review_at limit 20`);
}

export async function countUpcomingReviews(userId: string) {
  return withUser(userId, async (tx) => {
    const [r] = await tx<{ due: number; later: number }[]>`
      select count(*) filter (where next_review_at <= now())::int as due, count(*) filter (where next_review_at > now())::int as later
      from public.review_items where user_id = ${userId}`;
    return r ?? { due: 0, later: 0 };
  });
}

export async function submitReview(userId: string, stepId: string, rawAnswer: unknown, now = new Date()) {
  rateLimit(`review:${userId}`, 60, 60_000);
  return withService(async (tx) => {
    const [item] = await tx<{ interval_days: number; ease: string; repetitions: number; lapses: number; next_review_at: Date }[]>`
      select interval_days, ease, repetitions, lapses, next_review_at from public.review_items where user_id = ${userId} and step_id = ${stepId} for update`;
    if (!item) throw new AppError("not_found");
    if (item.next_review_at > now) throw new AppError("conflict", "Review not due yet");
    const [step] = await tx<{ kind: StepKind; lesson_id: string; course_id: string; access_tier: string; status: string }[]>`
      select s.kind, s.lesson_id, l.course_id, l.access_tier, l.status from public.lesson_steps s join public.lessons l on l.id = s.lesson_id where s.id = ${stepId}`;
    if (!step) throw new AppError("not_found");
    // Expired premium access also pauses premium reviews.
    if (step.access_tier === "premium") {
      const [{ ok } = { ok: false }] = await tx<{ ok: boolean }[]>`select public.has_premium_access(${userId}, ${step.course_id}) as ok`;
      if (!ok) throw new AppError("premium_required");
    }
    const [key] = await tx<{ answer: unknown; explanation: string }[]>`select answer, explanation from public.lesson_step_keys where step_id = ${stepId}`;
    const result = scoreStep(step.kind, key?.answer, rawAnswer);
    const s = scheduleReview({ interval_days: item.interval_days, ease: Number(item.ease), repetitions: item.repetitions, lapses: item.lapses }, Boolean(result.correct), now);
    await tx`update public.review_items set next_review_at = ${s.next_review_at}, interval_days = ${s.interval_days}, ease = ${s.ease},
             repetitions = ${s.repetitions}, lapses = ${s.lapses}, updated_at = now() where user_id = ${userId} and step_id = ${stepId}`;
    let xpAwarded = 0;
    if (result.correct) {
      const ins = await tx`insert into public.xp_ledger (user_id, event_type, source_id, points)
                           values (${userId}, 'review_complete', ${stepId + ":" + localDate(now)}, ${REVIEW_XP}) on conflict do nothing returning id`;
      if (ins.length) xpAwarded = REVIEW_XP;
    }
    return { correct: result.correct, explanation: key?.explanation ?? null, correctAnswer: key?.answer ?? null, nextReviewAt: s.next_review_at, xpAwarded };
  });
}

export async function getLearnerStats(userId: string) {
  return withUser(userId, async (tx) => {
    const [r] = await tx<{ xp: number; lessons: number; current_days: number; best_days: number }[]>`
      select (select coalesce(sum(points), 0)::int from public.xp_ledger where user_id = ${userId}) as xp,
             (select count(*)::int from public.lesson_progress where user_id = ${userId} and status = 'completed') as lessons,
             coalesce((select current_days from public.streaks where user_id = ${userId}), 0) as current_days,
             coalesce((select best_days from public.streaks where user_id = ${userId}), 0) as best_days`;
    return r!;
  });
}
