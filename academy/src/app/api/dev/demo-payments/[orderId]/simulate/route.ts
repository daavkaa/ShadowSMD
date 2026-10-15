import { randomUUID } from "node:crypto";
import { api } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { withService } from "@/lib/db/client";
import { DemoPaymentAdapter } from "@/features/commerce/payments/demo";
import { handleDemoWebhook, signDemoWebhook } from "@/features/commerce/webhooks";
import { uuidLike } from "@/lib/validation";

/**
 * DEV/TEST ONLY. Plays the role of the external provider: marks the provider-side
 * demo invoice as paid, then delivers a signed webhook through the same
 * verification pipeline a real provider would hit. Refused in production.
 */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  return api(req, async () => {
    if (getEnv().stage === "production") throw new AppError("not_found");
    const user = await requireUser();
    const orderId = uuidLike.parse((await params).orderId);
    const [o] = await withService((tx) => tx<{ provider: string; provider_invoice_id: string | null; buyer_user_id: string }[]>`
      select provider, provider_invoice_id, buyer_user_id from public.orders where id = ${orderId}`);
    if (!o || o.buyer_user_id !== user.id) throw new AppError("not_found");
    if (o.provider !== "demo" || !o.provider_invoice_id) throw new AppError("order_not_payable");
    await DemoPaymentAdapter.simulateProviderPayment(o.provider_invoice_id);
    const body = JSON.stringify({ event_id: `evt_${randomUUID()}`, order_id: orderId, type: "invoice.paid" });
    return handleDemoWebhook(body, signDemoWebhook(body));
  });
}
