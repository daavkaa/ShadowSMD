import { uuidLike } from "@/lib/validation";
import "server-only";
import { z } from "zod";
import { withService } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { hmacHex, sha256Hex, verifyHmac, safeEqualHex } from "@/lib/security/crypto";
import { refreshOrderFromProvider } from "./orders";

const demoEvent = z.object({ event_id: z.string().min(8).max(100), order_id: uuidLike, type: z.literal("invoice.paid") });

async function recordEvent(provider: string, eventId: string, rawBody: string): Promise<{ id: string } | null> {
  const rows = await withService((tx) => tx<{ id: string }[]>`
    insert into public.payment_webhook_events (provider, event_id, payload_hash) values (${provider}, ${eventId}, ${sha256Hex(rawBody)})
    on conflict (provider, event_id) do nothing returning id`);
  return rows[0] ?? null;
}

async function finishEvent(id: string, status: "processed" | "ignored" | "error" | "rejected", detail?: string) {
  await withService((tx) => tx`update public.payment_webhook_events set status = ${status}, detail = ${detail ?? null}, processed_at = now() where id = ${id}`);
}

/**
 * Demo provider webhook. Signature = HMAC-SHA256(rawBody, DEMO_WEBHOOK_SECRET).
 * Even with a valid signature we do not trust the body's claim: we query the
 * (simulated) provider for the invoice state before granting anything.
 */
export async function handleDemoWebhook(rawBody: string, signature: string | null) {
  const env = getEnv();
  if (env.stage === "production" || !env.DEMO_WEBHOOK_SECRET) throw new AppError("provider_not_configured");
  if (!verifyHmac(env.DEMO_WEBHOOK_SECRET, rawBody, signature)) throw new AppError("signature_invalid");
  let parsed: z.infer<typeof demoEvent>;
  try {
    parsed = demoEvent.parse(JSON.parse(rawBody));
  } catch {
    throw new AppError("invalid_input", "bad webhook payload");
  }
  const ev = await recordEvent("demo", parsed.event_id, rawBody);
  if (!ev) return { status: "duplicate" as const };
  try {
    const r = await refreshOrderFromProvider(parsed.order_id);
    await finishEvent(ev.id, r.status === "paid" ? "processed" : "ignored", JSON.stringify(r));
    return { status: "processed" as const, order: r };
  } catch (e) {
    await finishEvent(ev.id, "error", e instanceof Error ? e.message : "error");
    throw e;
  }
}

export function signDemoWebhook(rawBody: string): string {
  const secret = getEnv().DEMO_WEBHOOK_SECRET;
  if (!secret) throw new AppError("provider_not_configured");
  return hmacHex(secret, rawBody);
}

/**
 * QPay callback. We do not rely on the callback payload format (unverified);
 * the URL carries an HMAC token for the order id, and we confirm payment by
 * calling QPay's payment check API server-to-server.
 */
export async function handleQpayCallback(orderId: string | null, token: string | null, rawBody: string) {
  const env = getEnv();
  if (!env.QPAY_CALLBACK_SECRET) throw new AppError("provider_not_configured");
  if (!orderId || !uuidLike.safeParse(orderId).success || !token) throw new AppError("invalid_input");
  if (!safeEqualHex(hmacHex(env.QPAY_CALLBACK_SECRET, `callback:${orderId}`), token)) throw new AppError("signature_invalid");
  const ev = await recordEvent("qpay", `callback:${orderId}:${Date.now()}`, rawBody);
  const r = await refreshOrderFromProvider(orderId);
  if (ev) await finishEvent(ev.id, r.status === "paid" ? "processed" : "ignored", JSON.stringify(r));
  return r;
}
