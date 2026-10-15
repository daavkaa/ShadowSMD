import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/academy_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } }, grep: /@mobile/ },
  ],
  webServer: {
    // Requires `npm run build` first (CI does this). Demo payments + dev auth, never production.
    command: `node scripts/e2e-server.mjs`,
    url: `http://localhost:${PORT}/mn`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      APP_STAGE: "test",
      APP_URL: `http://localhost:${PORT}`,
      DATABASE_URL: DB,
      ...(process.env.E2E_DATABASE_URL ? { E2E_DATABASE_URL: process.env.E2E_DATABASE_URL } : {}),
      AUTH_MODE: "dev",
      DEV_AUTH_SECRET: "e2e-dev-auth-secret-0123456789abcdef",
      PAYMENT_PROVIDER: "demo",
      DEMO_WEBHOOK_SECRET: "e2e-demo-webhook-secret-0123456789abcdef",
      CRON_SECRET: "e2e-cron-secret-0123456789abcdef-0123",
    },
  },
});
