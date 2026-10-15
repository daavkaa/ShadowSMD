import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: { APP_STAGE: "test", AUTH_MODE: "dev", PAYMENT_PROVIDER: "demo", DEV_AUTH_SECRET: "test-secret-test-secret-test-secret-123", DEMO_WEBHOOK_SECRET: "demo-webhook-secret-for-tests-0123456789", APP_URL: "http://localhost:3000", DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/academy_test" },
  },
});
