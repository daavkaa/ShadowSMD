import { expect, test } from "@playwright/test";
import { ORIGIN, completeLessonViaApi, correctAnswer, db, devLogin, lessons } from "./helpers";

test("free → paywall → verified (demo) payment → premium → exam → verifiable certificate", async ({ page }) => {
  const email = `e2e-${Date.now()}@test.local`;
  await page.goto("/mn");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Өдөр бүр бага багаар");
  await devLogin(page, email);

  // Onboarding
  await page.goto("/mn/onboarding");
  await page.getByLabel("Сертификат дээр харагдах нэр").fill("Е2Е Суралцагч");
  await page.getByText("Өөрийн бизнесээ сурталчлах").click();
  await page.getByTestId("onboarding-submit").click();
  await page.waitForURL("**/mn/learn/smm-foundations");
  await expect(page.getByTestId("node-1")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("node-4")).toHaveAttribute("data-state", "premium_locked");

  // Lesson 1 through the real player UI (answers from the DB oracle)
  const [l1, l2, l3, l4, l5] = await lessons();
  await page.getByTestId("node-1").click();
  await page.waitForURL(`**/mn/lessons/${l1!.id}`);
  const steps = await db<{ id: string; kind: string; content: { options?: { id: string; label: string }[]; items?: { id: string; label: string }[] } }[]>`
    select id, kind, content from public.lesson_steps where lesson_id = ${l1!.id} order by sort_order`;
  for (const s of steps) {
    const ans = (await correctAnswer(s.id)) as { choice?: string; choices?: string[]; order?: string[]; text?: string };
    if (s.kind === "single_choice" || s.kind === "scenario") {
      await page.getByLabel(s.content.options!.find((o) => o.id === ans.choice)!.label).check();
    } else if (s.kind === "multi_choice") {
      for (const id of ans.choices!) await page.getByLabel(s.content.options!.find((o) => o.id === id)!.label).check();
    } else if (s.kind === "ordering") {
      // Move items into the correct order with the accessible ↑ buttons.
      for (let target = 0; target < ans.order!.length; target++) {
        const label = s.content.items!.find((o) => o.id === ans.order![target])!.label;
        const items = page.locator("ol li");
        let idx = (await items.allInnerTexts()).findIndex((t) => t.includes(label));
        while (idx > target) {
          await page.getByRole("button", { name: `«${label}»-г дээш` }).click();
          idx--;
        }
      }
    } else if (s.kind === "reflection") {
      await page.getByRole("textbox").fill(ans.text!);
    }
    await page.getByTestId("step-submit").click();
    if (s.kind !== "text" && s.kind !== "reflection") await page.getByTestId("step-continue").click();
  }
  await page.getByTestId("lesson-complete").click();
  await expect(page.getByText("Түвшин 1 дууслаа!")).toBeVisible();

  // Levels 2–3 via the same API the player uses
  await completeLessonViaApi(page.request, l2!.id);
  await completeLessonViaApi(page.request, l3!.id);

  // Premium is locked by raw URL and raw API
  await page.goto(`/mn/lessons/${l4!.id}`);
  await page.waitForURL("**/mn/unlock/smm-foundations");
  const [premiumStep] = await db<{ id: string }[]>`select id from public.lesson_steps where lesson_id = ${l4!.id} order by sort_order limit 1`;
  const blocked = await page.request.post(`/api/steps/${premiumStep!.id}/submit`, { data: { answer: { acknowledged: true } }, headers: ORIGIN });
  expect(blocked.status()).toBe(402);

  // Paywall → checkout (no plan pre-selected; terms visible before paying)
  await expect(page.getByText("Төлбөр төлснөөр шалгалт өгөх эрх нээгдэнэ")).toBeVisible();
  await expect(page.getByTestId("checkout-button")).toBeDisabled();
  await page.getByTestId("plan-pro_month_prepaid").check();
  await page.getByTestId("checkout-button").click();
  await page.waitForURL("**/mn/checkout/**");
  await expect(page.getByTestId("order-total")).toHaveText("29,900₮");
  await expect(page.getByTestId("order-status")).toHaveText("Төлбөр хүлээгдэж байна");
  await expect(page.getByText("ДЕМО · бодит мөнгө шилжихгүй")).toBeVisible();

  // Checking status without a provider payment must NOT unlock anything.
  await page.getByTestId("check-status").click();
  await expect(page.getByTestId("order-status")).toHaveText("Төлбөр хүлээгдэж байна");
  expect((await page.request.post(`/api/steps/${premiumStep!.id}/submit`, { data: { answer: { acknowledged: true } }, headers: ORIGIN })).status()).toBe(402);

  // Developer simulation of the provider-side payment → verified → paid
  await page.getByTestId("simulate-payment").click();
  await expect(page.getByTestId("order-status")).toHaveText("Төлөгдсөн (баталгаажсан)");

  // Premium levels now accessible
  await completeLessonViaApi(page.request, l4!.id);
  await completeLessonViaApi(page.request, l5!.id);
  await page.goto("/mn/learn/smm-foundations");
  await expect(page.getByTestId("node-6")).toHaveAttribute("data-state", "current");

  // Final exam through the UI
  await page.goto("/mn/certification/smm-foundations");
  await page.getByTestId("start-exam").click();
  await page.waitForURL("**/mn/certification/attempt/**");
  const attemptId = page.url().split("/").pop()!;
  const qs = await db<{ id: string; kind: string; body: { options: { id: string; label: string }[] }; correct: { correct: string | string[] } }[]>`
    select q.id, q.kind, q.body, k.correct from public.assessment_attempts a
    cross join lateral unnest(a.question_ids) as qid
    join public.assessment_questions q on q.id = qid join public.assessment_question_keys k on k.question_id = q.id
    where a.id = ${attemptId}`;
  for (const q of qs) {
    const fieldset = page.locator("fieldset", { has: page.locator(`input[name="${q.id}"]`) });
    for (const id of [q.correct.correct].flat()) await fieldset.getByLabel(q.body.options.find((o) => o.id === id)!.label, { exact: true }).check();
  }
  await page.getByTestId("submit-exam").click();
  await expect(page.getByTestId("exam-result")).toHaveText("Тэнцлээ!");

  // Certificate + public verification + PDF
  await page.getByTestId("view-certificates").click();
  await expect(page.getByTestId("credential-card")).toContainText("ДЕМО");
  const pdf = await page.request.get(await page.getByTestId("download-pdf").getAttribute("href") as string);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByRole("link", { name: "Баталгаажуулах хуудас" }).click();
  await expect(page.getByTestId("verify-status")).toHaveAttribute("data-status", "valid");
  await expect(page.getByText("Е2Е Суралцагч")).toBeVisible();
  await expect(page.getByText(/ДЕМО — бодит төлбөргүй/)).toBeVisible();
});

test("unknown credential shows invalid on the public verifier", async ({ page }) => {
  await page.goto("/verify/ZZZZZZZZZZZZZZZZZZZZ");
  await expect(page.getByTestId("verify-status")).toHaveAttribute("data-status", "invalid");
});
