import { uuidLike, isUuidLike } from "@/lib/validation";
import "server-only";
import { z } from "zod";
import { withService, withUser } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { EXAM_PASS_XP, examScorePct, scoreStep } from "@/features/learning/scoring";
import { issueCredentialTx } from "@/features/credentials/service";

const SUBMIT_GRACE_MS = 2 * 60_000;

export type CertificationState = {
  course: { id: string; slug: string; title: string };
  assessment: { id: string; title: string; question_count: number; pass_score_pct: number; time_limit_minutes: number; cooldown_hours: number } | null;
  lessonsCompleted: number;
  lessonsTotal: number;
  hasPremium: boolean;
  openAttempt: { id: string; expires_at: Date } | null;
  lastAttempt: { score_pct: number | null; passed: boolean | null; submitted_at: Date | null } | null;
  cooldownUntil: Date | null;
  credential: { public_id: string; credential_number: string; issued_at: Date; is_demo: boolean } | null;
  status: "locked_premium" | "locked_lessons" | "eligible" | "cooldown" | "in_progress" | "passed";
};

export async function getCertificationState(userId: string, courseSlug: string): Promise<CertificationState | null> {
  const base = await withUser(userId, async (tx) => {
    const [course] = await tx<{ id: string; slug: string; title: string }[]>`select id, slug, title from public.courses where slug = ${courseSlug} and status = 'published'`;
    if (!course) return null;
    const [assessment] = await tx<NonNullable<CertificationState["assessment"]>[]>`
      select id, title, question_count, pass_score_pct, time_limit_minutes, cooldown_hours from public.assessments
      where course_id = ${course.id} and kind = 'final' and status = 'published'`;
    const [counts] = (await tx<{ done: number; total: number }[]>`
      select (select count(*)::int from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
              where lp.user_id = ${userId} and l.course_id = ${course.id} and lp.status = 'completed' and l.status = 'published') as done,
             (select count(*)::int from public.lessons where course_id = ${course.id} and status = 'published') as total`) as unknown as [{ done: number; total: number }];
    const [premium] = (await tx<{ ok: boolean }[]>`
      select coalesce(bool_or(public.can_access_lesson(l.id)), false) as ok from public.lessons l where l.course_id = ${course.id} and l.access_tier = 'premium'`) as unknown as [{ ok: boolean }];
    const [cred] = await tx<NonNullable<CertificationState["credential"]>[]>`
      select public_id, credential_number, issued_at, is_demo from public.credentials where user_id = ${userId} and course_id = ${course.id} and revoked_at is null`;
    const [open] = assessment
      ? await tx<{ id: string; expires_at: Date }[]>`select id, expires_at from public.assessment_attempts where user_id = ${userId} and assessment_id = ${assessment.id} and status = 'in_progress' and expires_at > now()`
      : [];
    const [last] = assessment
      ? await tx<NonNullable<CertificationState["lastAttempt"]>[]>`select score_pct, passed, submitted_at from public.assessment_attempts where user_id = ${userId} and assessment_id = ${assessment.id} and status = 'submitted' order by submitted_at desc limit 1`
      : [];
    return { course, assessment: assessment ?? null, counts, premium: premium.ok, cred: cred ?? null, open: open ?? null, last: last ?? null };
  });
  if (!base) return null;
  const cooldownUntil =
    base.last && base.last.passed === false && base.last.submitted_at && base.assessment
      ? new Date(base.last.submitted_at.getTime() + base.assessment.cooldown_hours * 3_600_000)
      : null;
  const activeCooldown = cooldownUntil && cooldownUntil > new Date() ? cooldownUntil : null;
  const status: CertificationState["status"] = base.cred
    ? "passed"
    : !base.premium
      ? "locked_premium"
      : base.counts.done < base.counts.total
        ? "locked_lessons"
        : base.open
          ? "in_progress"
          : activeCooldown
            ? "cooldown"
            : "eligible";
  return {
    course: base.course,
    assessment: base.assessment,
    lessonsCompleted: base.counts.done,
    lessonsTotal: base.counts.total,
    hasPremium: base.premium,
    openAttempt: base.open,
    lastAttempt: base.last,
    cooldownUntil: activeCooldown,
    credential: base.cred,
    status,
  };
}

export async function startAttempt(userId: string, assessmentId: string, now = new Date()): Promise<{ attemptId: string; resumed: boolean }> {
  rateLimit(`exam-start:${userId}`, 10, 60_000);
  return withService(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"exam:" + userId + ":" + assessmentId}))`;
    const [a] = await tx<{ id: string; course_id: string; question_count: number; time_limit_minutes: number; cooldown_hours: number; requires_entitlement: boolean; status: string }[]>`
      select id, course_id, question_count, time_limit_minutes, cooldown_hours, requires_entitlement, status from public.assessments where id = ${assessmentId}`;
    if (!a || a.status !== "published") throw new AppError("not_found");
    if (a.requires_entitlement) {
      const [{ ok } = { ok: false }] = await tx<{ ok: boolean }[]>`select public.has_premium_access(${userId}, ${a.course_id}) as ok`;
      if (!ok) throw new AppError("premium_required");
    }
    const [{ missing } = { missing: 0 }] = await tx<{ missing: number }[]>`
      select count(*)::int as missing from public.lessons l where l.course_id = ${a.course_id} and l.status = 'published'
        and not exists (select 1 from public.lesson_progress lp where lp.user_id = ${userId} and lp.lesson_id = l.id and lp.status = 'completed')`;
    if (missing > 0) throw new AppError("lessons_incomplete", "Complete all levels first", { missing });
    const [cred] = await tx`select 1 from public.credentials where user_id = ${userId} and course_id = ${a.course_id} and revoked_at is null`;
    if (cred) throw new AppError("already_certified");

    const [open] = await tx<{ id: string; expires_at: Date }[]>`
      select id, expires_at from public.assessment_attempts where user_id = ${userId} and assessment_id = ${a.id} and status = 'in_progress' for update`;
    if (open) {
      if (open.expires_at.getTime() + SUBMIT_GRACE_MS > now.getTime()) return { attemptId: open.id, resumed: true };
      await tx`update public.assessment_attempts set status = 'expired', passed = false, score_pct = 0 where id = ${open.id}`;
    }
    const [last] = await tx<{ passed: boolean | null; submitted_at: Date | null; status: string; started_at: Date }[]>`
      select passed, submitted_at, status, started_at from public.assessment_attempts where user_id = ${userId} and assessment_id = ${a.id}
      order by attempt_number desc limit 1`;
    if (last && last.passed !== true) {
      const ref = last.submitted_at ?? last.started_at;
      const until = new Date(ref.getTime() + a.cooldown_hours * 3_600_000);
      if (until > now) throw new AppError("cooldown_active", "Retake cooldown", { until: until.toISOString() });
    }
    const questions = await tx<{ id: string }[]>`
      select id from public.assessment_questions where assessment_id = ${a.id} and active order by random() limit ${a.question_count}`;
    if (questions.length < a.question_count) throw new Error("question bank smaller than question_count");
    const [{ n }] = (await tx<{ n: number }[]>`select coalesce(max(attempt_number), 0)::int + 1 as n from public.assessment_attempts where user_id = ${userId} and assessment_id = ${a.id}`) as unknown as [{ n: number }];
    const expiresAt = new Date(now.getTime() + a.time_limit_minutes * 60_000);
    const [att] = (await tx<{ id: string }[]>`
      insert into public.assessment_attempts (user_id, assessment_id, attempt_number, question_ids, started_at, expires_at)
      values (${userId}, ${a.id}, ${n}, ${questions.map((q) => q.id)}::uuid[], ${now}, ${expiresAt}) returning id`) as unknown as [{ id: string }];
    await tx`insert into public.product_events (user_id, event_name, properties) values (${userId}, 'exam_started', ${tx.json({ attempt_id: att.id })})`;
    return { attemptId: att.id, resumed: false };
  });
}

export type AttemptView = {
  id: string;
  assessment_title: string;
  course_slug: string;
  expires_at: Date;
  status: string;
  pass_score_pct: number;
  questions: { id: string; kind: "single_choice" | "multi_choice"; prompt: string; options: { id: string; label: string }[] }[];
};

/** Questions are served without keys and only to the attempt owner. */
export async function getAttemptForUser(userId: string, attemptId: string): Promise<AttemptView | null> {
  if (!isUuidLike(attemptId)) return null;
  return withService(async (tx) => {
    const [att] = await tx<{ id: string; user_id: string; question_ids: string[]; expires_at: Date; status: string; title: string; pass_score_pct: number; course_slug: string }[]>`
      select t.id, t.user_id, t.question_ids, t.expires_at, t.status, a.title, a.pass_score_pct, c.slug as course_slug
      from public.assessment_attempts t join public.assessments a on a.id = t.assessment_id join public.courses c on c.id = a.course_id
      where t.id = ${attemptId}`;
    if (!att || att.user_id !== userId) return null;
    const qs = await tx<{ id: string; kind: "single_choice" | "multi_choice"; body: { prompt: string; options: { id: string; label: string }[] } }[]>`
      select id, kind, body from public.assessment_questions where id = any(${att.question_ids}::uuid[])`;
    const byId = new Map(qs.map((q) => [q.id, q]));
    return {
      id: att.id,
      assessment_title: att.title,
      course_slug: att.course_slug,
      expires_at: att.expires_at,
      status: att.status,
      pass_score_pct: att.pass_score_pct,
      questions: att.question_ids.map((id) => {
        const q = byId.get(id)!;
        return { id, kind: q.kind, prompt: q.body.prompt, options: q.body.options };
      }),
    };
  });
}

export const submitAttemptInput = z.object({
  answers: z.record(uuidLike, z.union([z.object({ choice: z.string().max(16) }), z.object({ choices: z.array(z.string().max(16)).max(12) })])),
});

export type AttemptResult = {
  scorePct: number;
  passed: boolean;
  passScorePct: number;
  correct: number;
  total: number;
  byTopic: { topic: string; correct: number; total: number }[];
  credentialPublicId: string | null;
};

export async function submitAttempt(userId: string, attemptId: string, input: unknown, now = new Date()): Promise<AttemptResult> {
  const { answers } = submitAttemptInput.parse(input);
  return withService(async (tx) => {
    const [att] = await tx<{ id: string; user_id: string; assessment_id: string; question_ids: string[]; expires_at: Date; status: string; pass_score_pct: number; course_id: string }[]>`
      select t.id, t.user_id, t.assessment_id, t.question_ids, t.expires_at, t.status, a.pass_score_pct, a.course_id
      from public.assessment_attempts t join public.assessments a on a.id = t.assessment_id where t.id = ${attemptId} for update of t`;
    if (!att || att.user_id !== userId) throw new AppError("not_found");
    if (att.status !== "in_progress") throw new AppError("attempt_closed");
    if (now.getTime() > att.expires_at.getTime() + SUBMIT_GRACE_MS) {
      await tx`update public.assessment_attempts set status = 'expired', passed = false, score_pct = 0, submitted_at = ${now} where id = ${att.id}`;
      throw new AppError("attempt_expired");
    }
    const keys = await tx<{ id: string; kind: "single_choice" | "multi_choice"; topic: string; correct: { correct: string | string[] } }[]>`
      select q.id, q.kind, q.topic, k.correct from public.assessment_questions q join public.assessment_question_keys k on k.question_id = q.id
      where q.id = any(${att.question_ids}::uuid[])`;
    let correctCount = 0;
    const topics = new Map<string, { correct: number; total: number }>();
    for (const k of keys) {
      const raw = answers[k.id];
      let ok = false;
      try {
        ok = raw ? scoreStep(k.kind, k.correct, raw).correct === true : false;
      } catch {
        ok = false; // malformed answer for this question counts as wrong
      }
      if (ok) correctCount++;
      const t = topics.get(k.topic) ?? { correct: 0, total: 0 };
      t.total++;
      if (ok) t.correct++;
      topics.set(k.topic, t);
      await tx`insert into public.assessment_answers (attempt_id, question_id, answer, is_correct) values (${att.id}, ${k.id}, ${tx.json((raw ?? {}) as never)}, ${ok})`;
    }
    const total = att.question_ids.length;
    const scorePct = examScorePct(correctCount, total);
    const passed = scorePct >= att.pass_score_pct;
    await tx`update public.assessment_attempts set status = 'submitted', submitted_at = ${now}, score_pct = ${scorePct}, passed = ${passed} where id = ${att.id}`;

    let credentialPublicId: string | null = null;
    if (passed) {
      const cred = await issueCredentialTx(tx, { userId, courseId: att.course_id, attemptId: att.id, scorePct });
      credentialPublicId = cred.publicId;
      await tx`insert into public.xp_ledger (user_id, event_type, source_id, points) values (${userId}, 'exam_pass', ${att.assessment_id}, ${EXAM_PASS_XP}) on conflict do nothing`;
      await tx`update public.enrollments set status = 'completed', completed_at = coalesce(completed_at, ${now}) where user_id = ${userId} and course_id = ${att.course_id}`;
    }
    await tx`insert into public.product_events (user_id, event_name, properties) values (${userId}, 'exam_submitted', ${tx.json({ attempt_id: att.id, score_pct: scorePct, passed })})`;
    return {
      scorePct,
      passed,
      passScorePct: att.pass_score_pct,
      correct: correctCount,
      total,
      byTopic: [...topics.entries()].map(([topic, v]) => ({ topic, ...v })),
      credentialPublicId,
    };
  });
}
