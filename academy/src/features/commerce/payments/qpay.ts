import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { CreatedInvoice, PaymentAdapter, VerifiedStatus } from "./types";

/**
 * QPay Merchant API v2 adapter — ⚠️ UNVERIFIED DRAFT.
 *
 * Endpoint paths and field names below follow the publicly described QPay v2
 * flow (auth/token → invoice → payment/check). They could NOT be verified from
 * this build environment (developer.qpay.mn unreachable). Before enabling:
 *   1. Obtain sandbox merchant credentials from QPay.
 *   2. Compare every request/response field with
 *      https://developer.qpay.mn/mn/docs/merchant?version=2.0.0
 *   3. Run tests/integration/qpay.contract.test.ts against the sandbox
 *      (QPAY_SANDBOX_CONTRACT=1) and only then set QPAY_CONTRACT_VERIFIED=true.
 * Responses are parsed strictly; anything unexpected is treated as NOT paid.
 */
type Config = { baseUrl: string; clientId: string; clientSecret: string; invoiceCode: string };

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().optional() });
const invoiceSchema = z.object({
  invoice_id: z.string().min(1),
  qr_text: z.string().optional(),
  urls: z.array(z.object({ name: z.string(), link: z.string() })).optional(),
});
const checkSchema = z.object({
  count: z.number().optional(),
  paid_amount: z.number().optional(),
  rows: z.array(
    z.object({
      payment_id: z.union([z.string(), z.number()]).transform(String),
      payment_status: z.string(),
      payment_amount: z.union([z.string(), z.number()]).transform(Number),
      payment_currency: z.string().optional(),
    }),
  ),
});

export class QPayAdapter implements PaymentAdapter {
  readonly name = "qpay" as const;
  readonly isDemo = false;
  readonly supportsRecurring = false; // QR invoices are one-time; recurring needs a card provider.
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly cfg: Config, private readonly fetchImpl: typeof fetch = fetch) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const res = await this.fetchImpl(`${this.cfg.baseUrl}/v2/auth/token`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64") },
    });
    if (!res.ok) throw new AppError("provider_error", `qpay auth ${res.status}`);
    const t = tokenSchema.parse(await res.json());
    this.token = { value: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 300) * 1000 };
    return t.access_token;
  }

  private async post(path: string, body: unknown) {
    const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new AppError("provider_error", `qpay ${path} ${res.status}`);
    return res.json();
  }

  async createInvoice(input: { orderId: string; amountMnt: number; description: string; callbackUrl: string }): Promise<CreatedInvoice> {
    const json = await this.post("/v2/invoice", {
      invoice_code: this.cfg.invoiceCode,
      sender_invoice_no: input.orderId,
      invoice_receiver_code: "terminal",
      invoice_description: input.description.slice(0, 255),
      amount: input.amountMnt,
      callback_url: input.callbackUrl,
    });
    const inv = invoiceSchema.parse(json);
    return { providerInvoiceId: inv.invoice_id, display: { qrText: inv.qr_text, deeplinks: inv.urls }, raw: { invoice_id: inv.invoice_id } };
  }

  async checkInvoice(providerInvoiceId: string): Promise<VerifiedStatus> {
    const json = await this.post("/v2/payment/check", {
      object_type: "INVOICE",
      object_id: providerInvoiceId,
      offset: { page_number: 1, page_limit: 100 },
    });
    const parsed = checkSchema.safeParse(json);
    if (!parsed.success) return { state: "failed", reason: "unexpected_provider_response" };
    const paid = parsed.data.rows.filter((r) => r.payment_status === "PAID" && (!r.payment_currency || r.payment_currency === "MNT"));
    if (!paid.length) return { state: "pending" };
    const amount = paid.reduce((a, r) => a + r.payment_amount, 0);
    return { state: "paid", providerPaymentId: paid.map((r) => r.payment_id).sort().join(","), amountMnt: amount, raw: parsed.data };
  }
}
