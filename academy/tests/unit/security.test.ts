import { describe, expect, it } from "vitest";
import { signDevSession, verifyDevSession } from "@/lib/auth/dev-session";
import { hmacHex, randomId, verifyHmac } from "@/lib/security/crypto";
import { entitlementCovers, type EntitlementLike } from "@/features/entitlements/resolver";
import { csvCell } from "@/features/organizations/service";
import { validateStepEdit } from "@/features/admin/service";
import { assertSafe, type Env } from "@/lib/env";

const SECRET = "x".repeat(40);
const UID = "11111111-2222-3333-4444-555555555555";

describe("dev session cookie", () => {
  it("round-trips and rejects tampering / expiry / wrong secret", () => {
    const t = signDevSession(SECRET, UID, 60, 1_000_000);
    expect(verifyDevSession(SECRET, t, 1_000_000)).toBe(UID);
    expect(verifyDevSession("y".repeat(40), t, 1_000_000)).toBeNull();
    expect(verifyDevSession(SECRET, t.replace(UID, "11111111-2222-3333-4444-555555555556"), 1_000_000)).toBeNull();
    expect(verifyDevSession(SECRET, t, 1_000_000 + 61_000)).toBeNull();
    expect(verifyDevSession(SECRET, "garbage", 0)).toBeNull();
  });
});

describe("crypto helpers", () => {
  it("verifies HMAC in constant-time-safe manner", () => {
    const sig = hmacHex(SECRET, "body");
    expect(verifyHmac(SECRET, "body", sig)).toBe(true);
    expect(verifyHmac(SECRET, "body2", sig)).toBe(false);
    expect(verifyHmac(SECRET, "body", "zz")).toBe(false);
    expect(verifyHmac(SECRET, "body", null)).toBe(false);
  });
  it("random ids are alphanumeric with the requested length", () => {
    const a = randomId(20);
    expect(a).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(randomId(20)).not.toBe(a);
  });
});

describe("entitlement resolver (mirror of SQL)", () => {
  const at = new Date("2026-10-15T00:00:00Z");
  const base: EntitlementLike = { scope_kind: "library_pro", scope_course_id: null, scope_bundle_product_id: null, status: "active", valid_from: new Date("2026-10-01"), valid_until: new Date("2026-11-01") };
  const course = { id: "c1", library_tier: "core" as const };
  const bundles = new Map([["b1", new Set(["c1"])]]);
  it("covers by library, course, and bundle snapshot", () => {
    expect(entitlementCovers(base, course, bundles, at)).toBe(true);
    expect(entitlementCovers({ ...base, scope_kind: "library_core" }, { id: "c1", library_tier: "pro" }, bundles, at)).toBe(false);
    expect(entitlementCovers({ ...base, scope_kind: "course", scope_course_id: "c1" }, course, bundles, at)).toBe(true);
    expect(entitlementCovers({ ...base, scope_kind: "bundle", scope_bundle_product_id: "b1" }, course, bundles, at)).toBe(true);
    expect(entitlementCovers({ ...base, scope_kind: "bundle", scope_bundle_product_id: "b1" }, { id: "c2", library_tier: "core" }, bundles, at)).toBe(false);
  });
  it("respects validity window and revocation", () => {
    expect(entitlementCovers({ ...base, valid_until: new Date("2026-10-15T00:00:00Z") }, course, bundles, at)).toBe(false);
    expect(entitlementCovers({ ...base, valid_from: new Date("2026-10-16") }, course, bundles, at)).toBe(false);
    expect(entitlementCovers({ ...base, status: "revoked" }, course, bundles, at)).toBe(false);
  });
});

describe("CSV export", () => {
  it("neutralizes formula injection and quotes", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+123")).toBe("'+123");
    expect(csvCell("Болд, Б")).toBe("\"Болд, Б\"");
    expect(csvCell("Сарнай")).toBe("Сарнай");
  });
});

describe("CMS validation", () => {
  it("rejects answer keys that reference unknown options", () => {
    const content = { prompt: "Асуулт?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] };
    expect(() => validateStepEdit("single_choice", content, { correct: "a" })).not.toThrow();
    expect(() => validateStepEdit("single_choice", content, { correct: "z" })).toThrow(/unknown option/);
    expect(() => validateStepEdit("ordering", { prompt: "Дараалал", items: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, { order: ["a"] })).toThrow();
  });
});

describe("environment safety", () => {
  const env = (o: Partial<Env>): Env => ({ NODE_ENV: "production", APP_URL: "https://x.mn", DATABASE_URL: "x", AUTH_MODE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-123", PAYMENT_PROVIDER: "qpay", QPAY_CONTRACT_VERIFIED: "true", CREDENTIAL_ISSUER_NAME: "SA", stage: "production", ...o }) as Env;
  it("refuses dev auth, demo payments and unverified QPay in production", () => {
    expect(() => assertSafe(env({}))).not.toThrow();
    expect(() => assertSafe(env({ AUTH_MODE: "dev", DEV_AUTH_SECRET: SECRET }))).toThrow(/AUTH_MODE=dev/);
    expect(() => assertSafe(env({ PAYMENT_PROVIDER: "demo" }))).toThrow(/demo/);
    expect(() => assertSafe(env({ QPAY_CONTRACT_VERIFIED: "false" }))).toThrow(/QPay/);
  });
});
