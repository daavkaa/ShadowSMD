import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { cancelOrder, createOrder, expireStaleOrders, refreshOrderFromProvider } from "@/features/commerce/orders";
import { applyVerifiedPayment, recordConfirmedRefund } from "@/features/commerce/processor";
import { DemoPaymentAdapter } from "@/features/commerce/payments/demo";
import { handleDemoWebhook, signDemoWebhook } from "@/features/commerce/webhooks";
import { getLessonForPlayer } from "@/features/learning/service";
import { resetRateLimits } from "@/lib/security/rate-limit";
import { admin, createUser, ids } from "../support/db";
import { buyWithDemo, finishLesson } from "../support/flows";

beforeEach(() => resetRateLimits());

const invoiceOf = async (orderId: string) =>
  (await admin<{ provider_invoice_id: string; status: string; total_mnt: number }[]>`select provider_invoice_id, status, total_mnt from public.orders where id = ${orderId}`)[0]!;
const entitlementsOf = async (userId: string) => admin`select * from public.entitlements where subject_user_id = ${userId}`;

describe("order creation", () => {
  it("derives the amount from the DB price, never the client", async () => {
    const u = await createUser();
    const { orderId } = await createOrder(u.id, { priceCode: "pro_year_prepaid", amount: 1 } as never);
    const o = await invoiceOf(orderId);
    expect(o.total_mnt).toBe(249000);
    expect(o.status).toBe("pending");
    expect(o.provider_invoice_id).toMatch(/^DEMO-/);
  });

  it("reuses the open order instead of creating a duplicate purchase", async () => {
    const u = await createUser();
    const a = await createOrder(u.id, { priceCode: "pro_month_prepaid" });
    const b = await createOrder(u.id, { priceCode: "pro_month_prepaid" });
    expect(b).toEqual({ orderId: a.orderId, reused: true });
  });

  it("refuses student plans without verification and B2B seats via B2C checkout", async () => {
    const u = await createUser();
    await expect(createOrder(u.id, { priceCode: "student_month_prepaid" })).rejects.toMatchObject({ code: "student_verification_required" });
    await expect(createOrder(u.id, { priceCode: "b2b_seat_10_19_month" })).rejects.toMatchObject({ code: "b2b_requires_invoice" });
    await expect(createOrder(u.id, { priceCode: "nope" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("payment verification & entitlement", () => {
  it("a pending/displayed invoice grants nothing; only provider-verified payment does", async () => {
    const u = await createUser();
    const { orderId } = await createOrder(u.id, { priceCode: "pro_month_prepaid" });
    // Webhook claiming payment while the provider still says pending → no grant.
    const body = JSON.stringify({ event_id: "evt_" + randomUUID(), order_id: orderId, type: "invoice.paid" });
    const r = await handleDemoWebhook(body, signDemoWebhook(body));
    expect(r).toMatchObject({ status: "processed", order: { status: "pending" } });
    expect(await entitlementsOf(u.id)).toHaveLength(0);
    expect((await refreshOrderFromProvider(orderId, { userId: u.id })).status).toBe("pending");

    await DemoPaymentAdapter.simulateProviderPayment((await invoiceOf(orderId)).provider_invoice_id);
    expect((await refreshOrderFromProvider(orderId, { userId: u.id })).status).toBe("paid");
    const ents = await entitlementsOf(u.id);
    expect(ents).toHaveLength(1);
    expect(ents[0]).toMatchObject({ scope_kind: "library_pro", source_kind: "subscription", status: "active", is_demo: true });
    const [sub] = await admin`select * from public.subscriptions where user_id = ${u.id}`;
    expect(sub).toMatchObject({ auto_renew: false, next_bill_at: null, status: "active" });
  });

  it("rejects bad signatures and treats duplicate/replayed webhooks as no-ops", async () => {
    const u = await createUser();
    const { orderId, body } = await buyWithDemo(u.id);
    await expect(handleDemoWebhook(body, "00".repeat(32))).rejects.toMatchObject({ code: "signature_invalid" });
    await expect(handleDemoWebhook(body, null)).rejects.toMatchObject({ code: "signature_invalid" });
    expect(await handleDemoWebhook(body, signDemoWebhook(body))).toEqual({ status: "duplicate" });
    // A new event id for the same paid order is processed but cannot double-grant.
    const body2 = JSON.stringify({ event_id: "evt_" + randomUUID(), order_id: orderId, type: "invoice.paid" });
    await handleDemoWebhook(body2, signDemoWebhook(body2));
    expect(await entitlementsOf(u.id)).toHaveLength(1);
    expect(await admin`select * from public.payments where order_id = ${orderId}`).toHaveLength(1);
  });

  it("concurrent verifications grant exactly once", async () => {
    const u = await createUser();
    const { orderId } = await createOrder(u.id, { priceCode: "smm_bundle_once" });
    const invoice = (await invoiceOf(orderId)).provider_invoice_id;
    const paymentId = await DemoPaymentAdapter.simulateProviderPayment(invoice);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => applyVerifiedPayment({ orderId, provider: "demo", providerPaymentId: paymentId, amountMnt: 299000, isDemo: true, raw: {} })),
    );
    expect(results.filter((r) => r.outcome === "granted")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "already_paid")).toHaveLength(4);
    expect(await entitlementsOf(u.id)).toHaveLength(1);
  });

  it("amount mismatch never grants access", async () => {
    const u = await createUser();
    const { orderId } = await createOrder(u.id, { priceCode: "pro_month_prepaid" });
    await DemoPaymentAdapter.simulateProviderPayment((await invoiceOf(orderId)).provider_invoice_id, 100);
    const r = await refreshOrderFromProvider(orderId);
    expect(r).toMatchObject({ outcome: "amount_mismatch" });
    expect(await entitlementsOf(u.id)).toHaveLength(0);
    expect((await invoiceOf(orderId)).status).toBe("pending");
    const [alert] = await admin`select * from public.outbox_events where topic = 'payment.amount_mismatch' and payload->>'orderId' = ${orderId}`;
    expect(alert).toBeTruthy();
  });

  it("paid premium unlocks premium lessons; bundle cannot be bought twice", async () => {
    const u = await createUser();
    const lessons = await ids.lessons();
    for (const l of lessons.filter((x) => x.access_tier === "free")) await finishLesson(u.id, l.id);
    const premium = lessons.find((l) => l.access_tier === "premium")!;
    await expect(getLessonForPlayer(u.id, premium.id)).rejects.toMatchObject({ code: "premium_required" });
    await buyWithDemo(u.id, "smm_bundle_once");
    expect((await getLessonForPlayer(u.id, premium.id)).steps.length).toBeGreaterThan(0);
    await expect(createOrder(u.id, { priceCode: "smm_bundle_once" })).rejects.toMatchObject({ code: "already_owned" });
  });

  it("buying another prepaid month while active extends from the current end", async () => {
    const u = await createUser();
    await buyWithDemo(u.id, "pro_month_prepaid");
    await buyWithDemo(u.id, "pro_month_prepaid");
    const ents = await admin<{ valid_from: Date; valid_until: Date }[]>`select valid_from, valid_until from public.entitlements where subject_user_id = ${u.id} order by valid_from`;
    expect(ents).toHaveLength(2);
    expect(ents[1]!.valid_from.getTime()).toBe(ents[0]!.valid_until.getTime());
  });

  it("refund revokes order-derived access", async () => {
    const u = await createUser();
    const { orderId } = await buyWithDemo(u.id, "smm_bundle_once");
    await recordConfirmedRefund(orderId, 299000, "test refund", null);
    const [e] = await entitlementsOf(u.id);
    expect(e).toMatchObject({ status: "revoked", revoked_reason: "refund" });
    expect((await invoiceOf(orderId)).status).toBe("refunded");
  });
});

describe("coupons", () => {
  it("reserves atomically, enforces per-user limit, releases on cancel/expiry", async () => {
    const code = "T" + randomUUID().slice(0, 6).toUpperCase();
    await admin`insert into public.coupons (code, discount_type, value, usage_limit) values (${code}, 'percent', 20, 2)`;
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const oa = await createOrder(a.id, { priceCode: "pro_year_prepaid", couponCode: code.toLowerCase() });
    expect((await invoiceOf(oa.orderId)).total_mnt).toBe(199200);
    await createOrder(b.id, { priceCode: "pro_year_prepaid", couponCode: code });
    await expect(createOrder(c.id, { priceCode: "pro_year_prepaid", couponCode: code })).rejects.toMatchObject({ code: "coupon_exhausted" });
    await expect(createOrder(a.id, { priceCode: "pro_month_prepaid", couponCode: code })).rejects.toMatchObject({ code: "coupon_exhausted" });
    await cancelOrder(a.id, oa.orderId);
    await createOrder(c.id, { priceCode: "pro_year_prepaid", couponCode: code });
    const [row] = await admin<{ used_count: number }[]>`select used_count from public.coupons where code = ${code}`;
    expect(row!.used_count).toBe(2);
    // expiry releases too
    await admin`update public.orders set expires_at = now() - interval '1 minute' where buyer_user_id = ${b.id} and status = 'pending'`;
    await expireStaleOrders();
    const [row2] = await admin<{ used_count: number }[]>`select used_count from public.coupons where code = ${code}`;
    expect(row2!.used_count).toBe(1);
  });

  it("rejects unknown coupons", async () => {
    const u = await createUser();
    await expect(createOrder(u.id, { priceCode: "pro_month_prepaid", couponCode: "NOPE" })).rejects.toMatchObject({ code: "coupon_invalid" });
  });
});
