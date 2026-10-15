import { expect, test } from "@playwright/test";
import { ORIGIN, db, devLogin } from "./helpers";

test("org manager sees own tenant only (UI, API, CSV)", async ({ page }) => {
  await page.goto("/mn");
  await devLogin(page, "manager@demo.local");
  await page.goto("/mn/org/demo-agency");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Демо Агентлаг ХХК");
  await expect(page.getByText("Тэмүүлэн (демо ажилтан)")).toBeVisible();
  await expect(page.getByText("Ганзориг")).toHaveCount(0);

  const res = await page.goto("/mn/org/other-company");
  expect(res!.status()).toBe(404);

  const [orgB] = await db<{ id: string }[]>`select id from public.organizations where slug = 'other-company'`;
  const [otherEmp] = await db<{ id: string }[]>`select md5('demo:other-employee')::uuid as id`;
  const assign = await page.request.post(`/api/orgs/${orgB!.id}/seats/assign`, { data: { userId: otherEmp!.id }, headers: ORIGIN });
  expect(assign.status()).toBe(403);
  const csv = await page.request.get(`/api/orgs/${orgB!.id}/report`);
  expect(csv.status()).toBe(403);
});

test("plain learner cannot open admin or org dashboards", async ({ page }) => {
  await page.goto("/mn");
  await devLogin(page, `plain-${Date.now()}@test.local`);
  expect((await page.goto("/mn/admin/courses"))!.status()).toBe(404);
  expect((await page.goto("/mn/org/demo-agency"))!.status()).toBe(404);
});

test("cross-site POSTs are rejected and unauthenticated API calls are 401", async ({ request }) => {
  const evil = await request.post("/api/orders", { data: { priceCode: "pro_month_prepaid" }, headers: { origin: "https://evil.example" } });
  expect(evil.status()).toBe(403);
  const anon = await request.post("/api/orders", { data: { priceCode: "pro_month_prepaid" }, headers: ORIGIN });
  expect(anon.status()).toBe(401);
  const hook = await request.post("/api/webhooks/demo", { data: { event_id: "evt_forged_0001", order_id: "00000000-0000-0000-0000-000000000000", type: "invoice.paid" }, headers: { "x-demo-signature": "00" } });
  expect(hook.status()).toBe(401);
  const cron = await request.get("/api/cron/reconcile");
  expect(cron.status()).toBe(401);
});

test("security headers are present", async ({ request }) => {
  const r = await request.get("/mn");
  expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
});
