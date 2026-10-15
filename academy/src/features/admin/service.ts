import "server-only";
import { z } from "zod";
import { withService, type Tx } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { answerSchemas, keySchemas, type StepKind } from "@/features/learning/scoring";

/** Staff authorization is read from the database on every call — never from client claims or flags. */
export async function requireStaff(tx: Tx, userId: string, roles: ("admin" | "editor" | "support")[] = ["admin", "editor"]) {
  const [r] = await tx`select 1 from public.platform_roles where user_id = ${userId} and role = any(${roles}::text[])`;
  if (!r) throw new AppError("forbidden");
}

export async function isStaff(userId: string) {
  return withService(async (tx) => {
    const [r] = await tx`select 1 from public.platform_roles where user_id = ${userId} and role in ('admin', 'editor')`;
    return Boolean(r);
  });
}

export async function listCoursesForAdmin(userId: string) {
  return withService(async (tx) => {
    await requireStaff(tx, userId);
    return tx<{ id: string; slug: string; title: string; status: string; version: number; reviewed_at: string | null; lessons: number }[]>`
      select c.id, c.slug, c.title, c.status, c.version, to_char(c.reviewed_at, 'YYYY-MM-DD') as reviewed_at,
             (select count(*)::int from public.lessons l where l.course_id = c.id) as lessons
      from public.courses c order by c.sort_order, c.title`;
  });
}

export async function getCourseForAdmin(userId: string, courseId: string) {
  return withService(async (tx) => {
    await requireStaff(tx, userId);
    const [course] = await tx<{ id: string; slug: string; title: string; summary: string; status: string; version: number }[]>`
      select id, slug, title, summary, status, version from public.courses where id = ${courseId}`;
    if (!course) throw new AppError("not_found");
    const lessons = await tx<{ id: string; title: string; access_tier: string; sort_order: number; status: string }[]>`
      select id, title, access_tier, sort_order, status from public.lessons where course_id = ${courseId} order by sort_order`;
    const steps = await tx<{ id: string; lesson_id: string; kind: StepKind; sort_order: number; points: number; content: unknown; answer: unknown; explanation: string | null }[]>`
      select s.id, s.lesson_id, s.kind, s.sort_order, s.points, s.content, k.answer, k.explanation
      from public.lesson_steps s left join public.lesson_step_keys k on k.step_id = s.id
      join public.lessons l on l.id = s.lesson_id where l.course_id = ${courseId} order by l.sort_order, s.sort_order`;
    return { course, lessons, steps };
  });
}

const choiceContent = z.object({ prompt: z.string().min(3), options: z.array(z.object({ id: z.string().min(1).max(16), label: z.string().min(1) })).min(2).max(8) });
const contentSchemas: Record<StepKind, z.ZodTypeAny> = {
  text: z.object({ title: z.string().min(1), body: z.array(z.string().min(1)).min(1), tip: z.string().optional() }),
  single_choice: choiceContent,
  multi_choice: choiceContent,
  scenario: choiceContent.extend({ context: z.string().min(3) }),
  ordering: z.object({ prompt: z.string().min(3), items: z.array(z.object({ id: z.string().min(1).max(16), label: z.string().min(1) })).min(2).max(8) }),
  reflection: z.object({ prompt: z.string().min(3), placeholder: z.string().optional() }),
};

export const updateStepInput = z.object({
  content: z.unknown(),
  answer: z.unknown().optional(),
  explanation: z.string().max(2000).optional(),
  points: z.number().int().min(0).max(20).optional(),
});

/** Validates step content + answer key consistency (answer ids must exist in the options). */
export function validateStepEdit(kind: StepKind, content: unknown, answer: unknown) {
  const c = contentSchemas[kind].parse(content) as { options?: { id: string }[]; items?: { id: string }[] };
  if (kind === "text" || kind === "reflection") return { content: c, answer: null };
  const k = keySchemas[kind as keyof typeof keySchemas].parse(answer) as { correct?: string | string[]; order?: string[] };
  const ids = new Set((c.options ?? c.items ?? []).map((o) => o.id));
  const used = k.order ?? (Array.isArray(k.correct) ? k.correct : [k.correct!]);
  if (!used.every((id) => ids.has(id))) throw new AppError("invalid_input", "answer key references unknown option");
  if (kind === "ordering" && (k.order!.length !== ids.size)) throw new AppError("invalid_input", "ordering key must include every item");
  // Sanity: the key itself must be a valid answer.
  answerSchemas[kind].parse(kind === "ordering" ? { order: k.order } : kind === "multi_choice" ? { choices: k.correct } : { choice: k.correct });
  return { content: c, answer: k };
}

export async function updateStep(userId: string, stepId: string, input: unknown) {
  const { content, answer, explanation, points } = updateStepInput.parse(input);
  return withService(async (tx) => {
    await requireStaff(tx, userId);
    const [step] = await tx<{ kind: StepKind; course_id: string }[]>`
      select s.kind, l.course_id from public.lesson_steps s join public.lessons l on l.id = s.lesson_id where s.id = ${stepId} for update of s`;
    if (!step) throw new AppError("not_found");
    const v = validateStepEdit(step.kind, content, answer);
    await tx`update public.lesson_steps set content = ${tx.json(v.content as never)}, points = coalesce(${points ?? null}, points) where id = ${stepId}`;
    if (v.answer) {
      await tx`insert into public.lesson_step_keys (step_id, answer, explanation) values (${stepId}, ${tx.json(v.answer as never)}, ${explanation ?? ""})
               on conflict (step_id) do update set answer = excluded.answer, explanation = excluded.explanation`;
    }
    await tx`update public.lessons set content_version = content_version + 1 where id = (select lesson_id from public.lesson_steps where id = ${stepId})`;
    await tx`insert into public.admin_audit_log (actor_id, action, entity_type, entity_id) values (${userId}, 'content.step.update', 'lesson_step', ${stepId})`;
    return { ok: true };
  });
}

export async function publishCourseVersion(userId: string, courseId: string, note: string) {
  return withService(async (tx) => {
    await requireStaff(tx, userId, ["admin"]);
    const [c] = (await tx<{ version: number }[]>`update public.courses set version = version + 1, reviewed_at = current_date where id = ${courseId} returning version`) as unknown as [{ version: number } | undefined];
    if (!c) throw new AppError("not_found");
    const snapshot = await tx`select l.id, l.title, l.content_version from public.lessons l where l.course_id = ${courseId} order by l.sort_order`;
    await tx`insert into public.course_publish_versions (course_id, version, change_note, snapshot, created_by)
             values (${courseId}, ${c.version}, ${note.slice(0, 500)}, ${tx.json(snapshot as never)}, ${userId})`;
    await tx`insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata) values (${userId}, 'course.publish', 'course', ${courseId}, ${tx.json({ version: c.version })})`;
    return { version: c.version };
  });
}
