import "server-only";
import { AppError } from "@/lib/errors";
import type { CreatedInvoice, PaymentAdapter, VerifiedStatus } from "./types";

/**
 * Placeholder for recurring card payments via Bonum PSP (tokenization +
 * PaymentPlan per https://psp.bonum.mn/bonum-gateway-apis.html). Intentionally
 * NOT implemented: contract, recurrence semantics, unsubscribe behaviour and
 * webhook signing must be confirmed with Bonum first. Until then auto-renewing
 * plans are not sold; monthly/yearly plans are prepaid fixed terms.
 */
export class BonumRecurringAdapter implements PaymentAdapter {
  readonly name = "bonum" as const;
  readonly isDemo = false;
  readonly supportsRecurring = true;
  async createInvoice(): Promise<CreatedInvoice> {
    throw new AppError("provider_not_configured", "Bonum recurring payments are pending merchant contract");
  }
  async checkInvoice(): Promise<VerifiedStatus> {
    throw new AppError("provider_not_configured", "Bonum recurring payments are pending merchant contract");
  }
}
