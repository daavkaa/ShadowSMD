// Fixed-window in-memory limiter. Per-instance only: on multi-instance hosting
// replace with a shared store (Postgres/Redis). Documented in SECURITY.md.
import { AppError } from "@/lib/errors";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) throw new AppError("rate_limited", "Too many requests", { retryAfterMs: b.resetAt - now });
}

export function resetRateLimits() {
  buckets.clear();
}
