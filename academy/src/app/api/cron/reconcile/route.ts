import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { safeEqualHex, sha256Hex } from "@/lib/security/crypto";
import { expireStaleOrders, reconcileRecentOrders } from "@/features/commerce/orders";

/** Scheduled job (e.g. Vercel Cron every 10 min): expire stale orders and re-verify recent ones with providers. */
export async function GET(req: Request) {
  const secret = getEnv().CRON_SECRET;
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqualHex(sha256Hex(auth), sha256Hex(secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const expired = await expireStaleOrders();
  const reconciled = await reconcileRecentOrders();
  return NextResponse.json({ expired, reconciled: reconciled.length, results: reconciled });
}
