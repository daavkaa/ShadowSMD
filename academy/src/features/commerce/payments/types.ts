export type ProviderName = "qpay" | "demo" | "bonum";

export type InvoiceDisplay = {
  qrText?: string;
  deeplinks?: { name: string; link: string }[];
  instructions?: string;
};

export type CreatedInvoice = { providerInvoiceId: string; display: InvoiceDisplay; raw?: unknown };

/** Provider truth for an invoice, obtained by querying the provider (never from a browser redirect). */
export type VerifiedStatus =
  | { state: "paid"; providerPaymentId: string; amountMnt: number; raw: unknown }
  | { state: "pending" }
  | { state: "failed"; reason: string };

export interface PaymentAdapter {
  readonly name: ProviderName;
  /** True for simulated providers. Grants created from demo payments are flagged is_demo. */
  readonly isDemo: boolean;
  /** Whether this adapter can charge automatically on a schedule (true recurring). */
  readonly supportsRecurring: boolean;
  createInvoice(input: { orderId: string; amountMnt: number; description: string; callbackUrl: string }): Promise<CreatedInvoice>;
  checkInvoice(providerInvoiceId: string): Promise<VerifiedStatus>;
}
