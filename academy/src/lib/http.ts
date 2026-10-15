import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, isAppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";

/** Rejects cross-site state-changing requests (CSRF defence in addition to SameSite cookies). */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin) {
    // Non-browser clients (no Origin) must not carry cookies cross-site; Sec-Fetch-Site helps when present.
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw new AppError("forbidden", "cross-site request");
    return;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("forbidden", "bad origin");
  }
  const appHost = new URL(getEnv().APP_URL).host;
  if (originHost !== host && originHost !== appHost) throw new AppError("forbidden", "cross-site request");
}

export function jsonError(e: unknown) {
  if (isAppError(e)) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: "invalid_input", message: "Invalid input", details: { issues: e.issues } } }, { status: 400 });
  }
  console.error("[api] unexpected error", e);
  return NextResponse.json({ error: { code: "internal", message: "Internal error" } }, { status: 500 });
}

export async function api(req: Request, fn: () => Promise<unknown>, opts: { csrf?: boolean } = {}) {
  try {
    if (opts.csrf !== false) assertSameOrigin(req);
    const result = await fn();
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("invalid_input", "Body must be JSON");
  }
}
