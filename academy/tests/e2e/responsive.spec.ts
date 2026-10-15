import { expect, test } from "@playwright/test";
import { devLogin } from "./helpers";

test("@mobile 360px: no horizontal overflow, bottom tabs, keyboard reachable nodes", async ({ page }) => {
  for (const path of ["/mn", "/mn/learn/smm-foundations", "/mn/unlock/smm-foundations", "/mn/academies"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  await devLogin(page, `mobile-${Date.now()}@test.local`);
  await page.goto("/mn/learn/smm-foundations");
  await expect(page.getByRole("navigation", { name: "Доод цэс" })).toBeVisible();
  const first = page.getByTestId("node-1");
  await first.focus();
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute("aria-label", /Түвшин 1: .* — одоогийн түвшин/);
});

test("desktop 1440px shows the sidebar instead of bottom tabs", async ({ page }) => {
  await page.goto("/mn/learn/smm-foundations");
  await expect(page.getByRole("navigation", { name: "Үндсэн цэс" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Доод цэс" })).toBeHidden();
});
