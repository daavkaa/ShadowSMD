import "server-only";
import { withService } from "@/lib/db/client";

const ALLOWED = new Set(["landing_viewed", "signup_completed", "onboarding_completed", "paywall_viewed", "plan_selected", "checkout_viewed", "certificate_downloaded", "verify_viewed"]);

/** Privacy-safe product analytics: allow-listed event names, no free-form PII. Never throws. */
export async function track(userId: string | null, eventName: string, properties: Record<string, string | number | boolean> = {}) {
  if (!ALLOWED.has(eventName)) return;
  try {
    await withService((tx) => tx`insert into public.product_events (user_id, event_name, properties) values (${userId}, ${eventName}, ${tx.json(properties)})`);
  } catch (e) {
    console.warn("[analytics] dropped event", eventName, e instanceof Error ? e.message : e);
  }
}
