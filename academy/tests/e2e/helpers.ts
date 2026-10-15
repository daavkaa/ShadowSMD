import { expect, type APIRequestContext, type Page } from "@playwright/test";
import postgres from "postgres";

export const db = postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/academy_e2e", { max: 2, onnotice: () => {} });

export async function devLogin(page: Page, email: string) {
  const res = await page.request.post("/api/auth/dev-login", { data: { email }, headers: { origin: new URL(page.url() === "about:blank" ? "http://localhost:3100" : page.url()).origin } });
  expect(res.ok()).toBeTruthy();
}

/** Test oracle: reads answer keys directly from the DB (never exposed by the app). */
export async function correctAnswer(stepId: string) {
  const [s] = await db<{ kind: string; answer: { correct?: string | string[]; order?: string[] } | null }[]>`
    select s.kind, k.answer from public.lesson_steps s left join public.lesson_step_keys k on k.step_id = s.id where s.id = ${stepId}`;
  switch (s!.kind) {
    case "text": return { acknowledged: true };
    case "reflection": return { text: "E2E: миний маркетингийн зорилго тодорхой." };
    case "single_choice": case "scenario": return { choice: s!.answer!.correct };
    case "multi_choice": return { choices: s!.answer!.correct };
    default: return { order: s!.answer!.order };
  }
}

export async function lessons() {
  return db<{ id: string; access_tier: string; sort_order: number }[]>`
    select l.id, l.access_tier, l.sort_order from public.lessons l join public.courses c on c.id = l.course_id where c.slug = 'smm-foundations' order by sort_order`;
}

export async function completeLessonViaApi(request: APIRequestContext, lessonId: string) {
  const steps = await db<{ id: string }[]>`select id from public.lesson_steps where lesson_id = ${lessonId} order by sort_order`;
  for (const s of steps) {
    const r = await request.post(`/api/steps/${s.id}/submit`, { data: { answer: await correctAnswer(s.id) }, headers: { origin: "http://localhost:3100" } });
    expect(r.status(), await r.text()).toBe(200);
  }
  const done = await request.post(`/api/lessons/${lessonId}/complete`, { headers: { origin: "http://localhost:3100" } });
  expect(done.status(), await done.text()).toBe(200);
}

export const ORIGIN = { origin: "http://localhost:3100" };
