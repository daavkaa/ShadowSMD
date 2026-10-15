import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** local | test | staging | production. Demo payments and dev auth are refused in production. */
  APP_STAGE: z.enum(["local", "test", "staging", "production"]).optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_MODE: z.enum(["supabase", "dev"]).default("supabase"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10).optional(),
  DEV_AUTH_SECRET: z.string().min(32).optional(),
  PAYMENT_PROVIDER: z.enum(["qpay", "demo"]).default("demo"),
  DEMO_WEBHOOK_SECRET: z.string().min(32).optional(),
  QPAY_BASE_URL: z.string().url().optional(),
  QPAY_CLIENT_ID: z.string().optional(),
  QPAY_CLIENT_SECRET: z.string().optional(),
  QPAY_INVOICE_CODE: z.string().optional(),
  QPAY_CALLBACK_SECRET: z.string().min(32).optional(),
  QPAY_CONTRACT_VERIFIED: z.enum(["true", "false"]).default("false"),
  CRON_SECRET: z.string().min(32).optional(),
  CREDENTIAL_ISSUER_NAME: z.string().default("Skills Academy"),
});

export type Env = z.infer<typeof schema> & { stage: "local" | "test" | "staging" | "production" };

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid environment: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const e = parsed.data;
  const stage = e.APP_STAGE ?? (e.NODE_ENV === "production" ? "production" : "local");
  const env: Env = { ...e, stage };
  assertSafe(env);
  cached = env;
  return env;
}

/** Fail closed on configurations that must never reach production. */
export function assertSafe(env: Env) {
  if (env.stage === "production") {
    if (env.AUTH_MODE === "dev") throw new Error("AUTH_MODE=dev is forbidden when APP_STAGE=production");
    if (env.PAYMENT_PROVIDER === "demo") throw new Error("PAYMENT_PROVIDER=demo is forbidden when APP_STAGE=production");
    if (env.PAYMENT_PROVIDER === "qpay" && env.QPAY_CONTRACT_VERIFIED !== "true") {
      throw new Error("QPay adapter must pass sandbox contract tests (QPAY_CONTRACT_VERIFIED=true) before production use");
    }
  }
  if (env.AUTH_MODE === "dev" && !env.DEV_AUTH_SECRET) throw new Error("DEV_AUTH_SECRET is required for AUTH_MODE=dev");
  if (env.AUTH_MODE === "supabase" && (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for AUTH_MODE=supabase");
  }
}

/** Test helper: re-read process.env. */
export function resetEnvCache() {
  cached = undefined;
}
