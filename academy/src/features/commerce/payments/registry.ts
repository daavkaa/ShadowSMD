import "server-only";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { hmacHex } from "@/lib/security/crypto";
import { DemoPaymentAdapter } from "./demo";
import { QPayAdapter } from "./qpay";
import { BonumRecurringAdapter } from "./bonum";
import type { PaymentAdapter, ProviderName } from "./types";

let qpay: QPayAdapter | undefined;

export function getAdapter(name: ProviderName): PaymentAdapter {
  const env = getEnv();
  switch (name) {
    case "demo":
      if (env.stage === "production") throw new AppError("provider_not_configured", "demo provider disabled in production");
      return new DemoPaymentAdapter();
    case "qpay": {
      if (!env.QPAY_BASE_URL || !env.QPAY_CLIENT_ID || !env.QPAY_CLIENT_SECRET || !env.QPAY_INVOICE_CODE || !env.QPAY_CALLBACK_SECRET) {
        throw new AppError("provider_not_configured", "QPay credentials missing");
      }
      qpay ??= new QPayAdapter({ baseUrl: env.QPAY_BASE_URL, clientId: env.QPAY_CLIENT_ID, clientSecret: env.QPAY_CLIENT_SECRET, invoiceCode: env.QPAY_INVOICE_CODE });
      return qpay;
    }
    case "bonum":
      return new BonumRecurringAdapter();
  }
}

export function defaultProvider(): ProviderName {
  return getEnv().PAYMENT_PROVIDER;
}

/** Callback URL carries an HMAC of the order id so random callers cannot trigger provider checks for arbitrary orders. */
export function callbackUrlFor(provider: ProviderName, orderId: string): string {
  const env = getEnv();
  const secret = provider === "qpay" ? env.QPAY_CALLBACK_SECRET : env.DEMO_WEBHOOK_SECRET;
  const token = secret ? hmacHex(secret, `callback:${orderId}`) : "";
  return `${env.APP_URL}/api/webhooks/${provider}?order=${encodeURIComponent(orderId)}&token=${token}`;
}
