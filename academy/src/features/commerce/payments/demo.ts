import "server-only";
import { withService } from "@/lib/db/client";
import { randomId } from "@/lib/security/crypto";
import type { CreatedInvoice, PaymentAdapter, VerifiedStatus } from "./types";

/**
 * DEMO provider for local development and automated tests. It never marks
 * anything paid by itself: an invoice only becomes "paid" when a developer
 * explicitly triggers the simulator (non-production only), and our webhook
 * pipeline must still verify that state by querying this adapter.
 */
export class DemoPaymentAdapter implements PaymentAdapter {
  readonly name = "demo" as const;
  readonly isDemo = true;
  readonly supportsRecurring = false;

  async createInvoice(input: { orderId: string; amountMnt: number; description: string }): Promise<CreatedInvoice> {
    const invoiceId = "DEMO-" + randomId(16);
    await withService((tx) => tx`insert into public.demo_provider_invoices (invoice_id, amount_mnt) values (${invoiceId}, ${input.amountMnt})`);
    return {
      providerInvoiceId: invoiceId,
      display: {
        qrText: `DEMO-ONLY|${invoiceId}|${input.amountMnt}|NOT-A-REAL-PAYMENT`,
        instructions: "ДЕМО горим: энэ QR бодит банкны апп-аар уншигдахгүй, ямар ч мөнгө шилжихгүй.",
      },
    };
  }

  async checkInvoice(providerInvoiceId: string): Promise<VerifiedStatus> {
    const [row] = await withService((tx) => tx<{ status: string; payment_id: string | null; paid_amount_mnt: number | null }[]>`
      select status, payment_id, paid_amount_mnt from public.demo_provider_invoices where invoice_id = ${providerInvoiceId}`);
    if (!row) return { state: "failed", reason: "unknown_invoice" };
    if (row.status === "paid" && row.payment_id && row.paid_amount_mnt !== null) {
      return { state: "paid", providerPaymentId: row.payment_id, amountMnt: row.paid_amount_mnt, raw: { simulated: true } };
    }
    if (row.status === "cancelled") return { state: "failed", reason: "cancelled" };
    return { state: "pending" };
  }

  /** Simulator: mutates the *provider-side* ledger only. Caller must be non-production. */
  static async simulateProviderPayment(providerInvoiceId: string, paidAmountMnt?: number) {
    return withService(async (tx) => {
      const [row] = await tx<{ amount_mnt: number; status: string; payment_id: string | null }[]>`
        select amount_mnt, status, payment_id from public.demo_provider_invoices where invoice_id = ${providerInvoiceId} for update`;
      if (!row) throw new Error("unknown demo invoice");
      if (row.status === "paid") return row.payment_id!;
      const paymentId = "DEMOPAY-" + randomId(16);
      await tx`update public.demo_provider_invoices set status = 'paid', payment_id = ${paymentId},
               paid_amount_mnt = ${paidAmountMnt ?? row.amount_mnt}, paid_at = now() where invoice_id = ${providerInvoiceId}`;
      return paymentId;
    });
  }
}
