import { isUuidLike } from "@/lib/validation";
import "server-only";
import { z } from "zod";
import { withService, withUser, type Tx } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { randomToken } from "@/lib/security/crypto";
import { assertCouponUsable, computeAmounts, normalizeCouponCode, type CouponRow } from "./pricing";
import { callbackUrlFor, defaultProvider, getAdapter } from "./payments/registry";
import type { ProviderName, VerifiedStatus } from "./payments/types";
import { applyVerifiedPayment } from "./processor";

export const ORDER_TTL_MINUTES = 30;

export const createOrderInput = z.object({
  priceCode: z.string().min(1).max(64),
  couponCode: z.string().trim().max(32).optional().transform((v) => (v ? v : undefined)),
});

export type OrderView = {
  id: string;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled" | "refunded";
  provider: ProviderName | "manual_invoice";
  product_name: string;
  product_kind: string;
  price_code: string;
  billing_interval: string;
  access_days: number | null;
  auto_renew: boolean;
  tax_mode: string;
  quantity: number;
  subtotal_mnt: number;
  discount_mnt: number;
  total_mnt: number;
  expires_at: Date;
  paid_at: Date | null;
  created_at: Date;
  provider_payload: { qrText?: string; deeplinks?: { name: string; link: string }[]; instructions?: string };
};

type PriceRow = {
  price_id: string;
  product_id: string;
  amount_mnt: number;
  billing_interval: string;
  access_days: number | null;
  min_quantity: number;
  product_kind: string;
  product_name: string;
  scope_kind: string;
  scope_course_id: string | null;
  audience: string;
  requires_student_verification: boolean;
};

/**
 * Creates (or returns the existing open) order. Amount, scope and provider are
 * derived from trusted DB rows — the client only names a price code.
 */
export async function createOrder(userId: string, input: z.input<typeof createOrderInput>, now = new Date()): Promise<{ orderId: string; reused: boolean }> {
  const { priceCode, couponCode } = createOrderInput.parse(input);
  rateLimit(`order:${userId}`, 10, 60_000);
  const provider = defaultProvider();

  const created = await withService(async (tx) => {
    const [price] = await tx<PriceRow[]>`
      select pr.id as price_id, p.id as product_id, pr.amount_mnt, pr.billing_interval, pr.access_days, pr.min_quantity,
             p.kind as product_kind, p.name as product_name, p.scope_kind, p.scope_course_id, p.audience, p.requires_student_verification
      from public.prices pr join public.products p on p.id = pr.product_id
      where pr.code = ${priceCode} and pr.active and p.status = 'active'`;
    if (!price) throw new AppError("not_found", "Unknown price");
    if (price.requires_student_verification) throw new AppError("student_verification_required");
    if (price.audience !== "b2c") throw new AppError("b2b_requires_invoice");

    // Serialize order creation per buyer.
    await tx`select pg_advisory_xact_lock(hashtext(${"order:" + userId}))`;
    await expireStaleOrdersTx(tx, userId, now);

    const [open] = await tx<{ id: string }[]>`
      select id from public.orders where buyer_user_id = ${userId} and price_id = ${price.price_id} and status = 'pending'`;
    if (open) return { orderId: open.id, reused: true, needsInvoice: false, total: 0, description: "" };

    if (price.billing_interval === "one_time") {
      const [owned] = await tx<{ id: string }[]>`
        select e.id from public.entitlements e
        where e.subject_user_id = ${userId} and e.status = 'active' and e.source_kind = 'order'
          and (e.valid_until is null or e.valid_until > ${now})
          and ((e.scope_kind = 'bundle' and e.scope_bundle_product_id = ${price.product_id})
               or (e.scope_kind = 'course' and e.scope_course_id = ${price.scope_course_id}))`;
      if (owned) throw new AppError("already_owned");
    }

    let coupon: CouponRow | null = null;
    if (couponCode) {
      const [c] = await tx<CouponRow[]>`select * from public.coupons where code = ${normalizeCouponCode(couponCode)} for update`;
      if (!c) throw new AppError("coupon_invalid");
      const [{ n }] = (await tx<{ n: number }[]>`
        select count(*)::int as n from public.coupon_redemptions where coupon_id = ${c.id} and user_id = ${userId} and status in ('reserved', 'consumed')`) as unknown as [{ n: number }];
      assertCouponUsable(c, price.price_id, n, now);
      coupon = c;
    }

    const amounts = computeAmounts(price.amount_mnt, price.min_quantity, coupon);
    const expiresAt = new Date(now.getTime() + ORDER_TTL_MINUTES * 60_000);
    const [order] = (await tx<{ id: string }[]>`
      insert into public.orders (buyer_user_id, product_id, price_id, quantity, unit_amount_mnt, subtotal_mnt, discount_mnt, total_mnt,
                                 coupon_id, provider, idempotency_key, expires_at)
      values (${userId}, ${price.product_id}, ${price.price_id}, ${price.min_quantity}, ${price.amount_mnt}, ${amounts.subtotal},
              ${amounts.discount}, ${amounts.total}, ${coupon?.id ?? null}, ${provider}, ${randomToken(24)}, ${expiresAt})
      returning id`) as unknown as [{ id: string }];
    if (coupon) {
      // Atomic reservation: the CHECK (used_count <= usage_limit) backs up the row lock.
      await tx`update public.coupons set used_count = used_count + 1 where id = ${coupon.id}`;
      await tx`insert into public.coupon_redemptions (coupon_id, order_id, user_id) values (${coupon.id}, ${order.id}, ${userId})`;
    }
    await tx`insert into public.product_events (user_id, event_name, properties) values (${userId}, 'order_created', ${tx.json({ order_id: order.id, price_code: priceCode })})`;
    return { orderId: order.id, reused: false, needsInvoice: true, total: amounts.total, description: price.product_name };
  });

  if (created.needsInvoice) {
    // Provider call happens outside the DB transaction; failures leave a clearly failed order.
    try {
      const adapter = getAdapter(provider);
      const inv = await adapter.createInvoice({
        orderId: created.orderId,
        amountMnt: created.total,
        description: created.description,
        callbackUrl: callbackUrlFor(provider, created.orderId),
      });
      await withService((tx) => tx`
        update public.orders set provider_invoice_id = ${inv.providerInvoiceId}, provider_payload = ${tx.json(inv.display as never)}
        where id = ${created.orderId} and status = 'pending'`);
    } catch (e) {
      await withService(async (tx) => {
        await tx`update public.orders set status = 'failed' where id = ${created.orderId} and status = 'pending'`;
        await releaseCoupon(tx, created.orderId);
      });
      throw e instanceof AppError ? e : new AppError("provider_error", "Could not create invoice");
    }
  }
  return { orderId: created.orderId, reused: created.reused };
}

async function releaseCoupon(tx: Tx, orderId: string) {
  const rel = await tx<{ coupon_id: string }[]>`
    update public.coupon_redemptions set status = 'released' where order_id = ${orderId} and status = 'reserved' returning coupon_id`;
  for (const r of rel) await tx`update public.coupons set used_count = greatest(used_count - 1, 0) where id = ${r.coupon_id}`;
}

async function expireStaleOrdersTx(tx: Tx, userId: string | null, now: Date) {
  const expired = userId
    ? await tx<{ id: string }[]>`update public.orders set status = 'expired' where status = 'pending' and expires_at <= ${now} and buyer_user_id = ${userId} returning id`
    : await tx<{ id: string }[]>`update public.orders set status = 'expired' where status = 'pending' and expires_at <= ${now} returning id`;
  for (const o of expired) await releaseCoupon(tx, o.id);
  return expired.length;
}

/** Scheduled job: expire pending orders and release coupon reservations. */
export async function expireStaleOrders(now = new Date()) {
  return withService((tx) => expireStaleOrdersTx(tx, null, now));
}

export async function cancelOrder(userId: string, orderId: string) {
  return withService(async (tx) => {
    const [o] = await tx<{ status: string }[]>`select status from public.orders where id = ${orderId} and buyer_user_id = ${userId} for update`;
    if (!o) throw new AppError("not_found");
    if (o.status !== "pending") throw new AppError("order_not_payable");
    await tx`update public.orders set status = 'cancelled' where id = ${orderId}`;
    await releaseCoupon(tx, orderId);
    return { ok: true };
  });
}

export async function getOrderForUser(userId: string, orderId: string): Promise<OrderView | null> {
  if (!isUuidLike(orderId)) return null;
  return withUser(userId, async (tx) => {
    const [o] = await tx<OrderView[]>`
      select o.id, o.status, o.provider, p.name as product_name, p.kind as product_kind, pr.code as price_code, pr.billing_interval,
             pr.access_days, pr.auto_renew, pr.tax_mode, o.quantity, o.subtotal_mnt, o.discount_mnt, o.total_mnt, o.expires_at, o.paid_at,
             o.created_at, o.provider_payload
      from public.orders o join public.products p on p.id = o.product_id join public.prices pr on pr.id = o.price_id
      where o.id = ${orderId}`; // RLS: buyer only
    return o ?? null;
  });
}

/**
 * Re-checks a pending order with the provider (server-to-provider), and applies
 * the payment if — and only if — the provider confirms it. Used by the
 * checkout page poller and by reconciliation.
 */
export async function refreshOrderFromProvider(orderId: string, opts: { userId?: string } = {}) {
  if (opts.userId) rateLimit(`order-check:${opts.userId}`, 30, 60_000);
  const [o] = await withService((tx) => tx<{ id: string; buyer_user_id: string; status: string; provider: ProviderName; provider_invoice_id: string | null; expires_at: Date }[]>`
    select id, buyer_user_id, status, provider, provider_invoice_id, expires_at from public.orders where id = ${orderId}`);
  if (!o || (opts.userId && o.buyer_user_id !== opts.userId)) throw new AppError("not_found");
  if (o.status !== "pending" && o.status !== "expired") return { status: o.status };
  if (!o.provider_invoice_id) return { status: o.status };
  const adapter = getAdapter(o.provider);
  const verified: VerifiedStatus = await adapter.checkInvoice(o.provider_invoice_id);
  if (verified.state === "paid") {
    const r = await applyVerifiedPayment({ orderId, provider: o.provider, isDemo: adapter.isDemo, ...verified });
    return { status: r.outcome === "amount_mismatch" ? "pending" : "paid", outcome: r.outcome };
  }
  if (o.status === "pending" && o.expires_at <= new Date()) {
    await withService((tx) => expireStaleOrdersTx(tx, o.buyer_user_id, new Date()));
    return { status: "expired" };
  }
  return { status: o.status };
}

/** Reconciliation job: re-verify recent pending/expired orders with providers. */
export async function reconcileRecentOrders(limit = 50) {
  const rows = await withService((tx) => tx<{ id: string }[]>`
    select id from public.orders where status in ('pending', 'expired') and provider_invoice_id is not null
      and created_at > now() - interval '3 days' order by created_at desc limit ${limit}`);
  const results: { id: string; status: string }[] = [];
  for (const r of rows) {
    try {
      const res = await refreshOrderFromProvider(r.id);
      results.push({ id: r.id, status: res.status });
    } catch (e) {
      results.push({ id: r.id, status: "error:" + (e instanceof Error ? e.message : "unknown") });
    }
  }
  return results;
}

export async function listMyOrders(userId: string) {
  return withUser(userId, async (tx) => tx<{ id: string; status: string; product_name: string; total_mnt: number; created_at: Date; paid_at: Date | null; provider: string }[]>`
    select o.id, o.status, p.name as product_name, o.total_mnt, o.created_at, o.paid_at, o.provider
    from public.orders o join public.products p on p.id = o.product_id order by o.created_at desc limit 50`);
}
