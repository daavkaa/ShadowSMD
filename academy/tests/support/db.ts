import postgres from "postgres";
import { randomUUID } from "node:crypto";

export const TEST_DB_URL = process.env.DATABASE_URL!;
export const admin = postgres(TEST_DB_URL, { max: 2, onnotice: () => {} });

export const ids = {
  course: async () => (await admin<{ id: string }[]>`select id from public.courses where slug = 'smm-foundations'`)[0]!.id,
  lessons: async () => admin<{ id: string; access_tier: string; sort_order: number }[]>`
    select l.id, l.access_tier, l.sort_order from public.lessons l join public.courses c on c.id = l.course_id where c.slug = 'smm-foundations' order by l.sort_order`,
  assessment: async () => (await admin<{ id: string }[]>`select id from public.assessments where slug = 'smm-foundations-final'`)[0]!.id,
  demoUser: async (key: string) => (await admin<{ id: string }[]>`select md5(${"demo:" + key})::uuid as id`)[0]!.id,
  org: async (slug: string) => (await admin<{ id: string }[]>`select id from public.organizations where slug = ${slug}`)[0]!.id,
};

export async function createUser(name = "Тест суралцагч"): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `u-${id.slice(0, 8)}@test.local`;
  await admin`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${email}, ${admin.json({ display_name: name })})`;
  return { id, email };
}

/** Run a query exactly as a Supabase client for this user would (RLS enforced). */
export async function asUser<T>(userId: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await admin.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" })}, true)`;
    await tx.unsafe(userId ? "set local role authenticated" : "set local role anon");
    return fn(tx);
  })) as T;
}

/** Correct answers straight from the key table (test-only, service role). */
export async function correctAnswerFor(stepId: string): Promise<unknown> {
  const [s] = await admin<{ kind: string; answer: { correct?: string | string[]; order?: string[] } | null }[]>`
    select s.kind, k.answer from public.lesson_steps s left join public.lesson_step_keys k on k.step_id = s.id where s.id = ${stepId}`;
  switch (s!.kind) {
    case "text": return { acknowledged: true };
    case "reflection": return { text: "Миний бизнесийн зорилго: шинэ хэрэглэгч татах." };
    case "single_choice": case "scenario": return { choice: s!.answer!.correct };
    case "multi_choice": return { choices: s!.answer!.correct };
    case "ordering": return { order: s!.answer!.order };
  }
  throw new Error("unknown kind");
}

export async function wrongAnswerFor(stepId: string): Promise<unknown> {
  const [s] = await admin<{ kind: string; content: { options?: { id: string }[]; items?: { id: string }[] }; answer: { correct?: string | string[]; order?: string[] } }[]>`
    select s.kind, s.content, k.answer from public.lesson_steps s join public.lesson_step_keys k on k.step_id = s.id where s.id = ${stepId}`;
  const opts = (s!.content.options ?? s!.content.items ?? []).map((o) => o.id);
  switch (s!.kind) {
    case "single_choice": case "scenario": return { choice: opts.find((o) => o !== s!.answer.correct) };
    case "multi_choice": return { choices: [opts.find((o) => !(s!.answer.correct as string[]).includes(o)) ?? opts[0]] };
    case "ordering": return { order: [...s!.answer.order!].reverse() };
  }
  throw new Error("not scorable");
}

export async function stepsOf(lessonId: string) {
  return admin<{ id: string; kind: string }[]>`select id, kind from public.lesson_steps where lesson_id = ${lessonId} order by sort_order`;
}
