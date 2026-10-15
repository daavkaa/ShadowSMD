import "server-only";
import { withService, type Tx } from "@/lib/db/client";
import type { ProviderName } from "./payments/types";

export type VerifiedPayment = {
  orderId: string;
  provider: ProviderName;
  providerPaymentId: string;
  amountMnt: number;
  isDemo: boolean;
  raw: unknown;
};

export type ApplyOutcome = "granted" | "already_paid" | "amount_mismatch" | "not_payable";

/**
 * The single place where money turns into access. Must only be called with a
 * status obtained by querying the provider (or a verified signed webhook +
 * provider query). Idempotent: concurrent/replayed calls grant at most once
 * thanks to the order row lock and unique constraints on payments/entitlements.
 */
export async function applyVerifiedPayment(p: VerifiedPayment): Promise<{ outcome: ApplyOutcome }> {
  return withService(async (tx) => {
    const [order] = await tx<{ id: string; status: string; total_mnt: number; buyer_user_id: string; product_id: string; price_id: string; provider: string; organization_id: string | null }[]>`
      select id, status, total_mnt, buyer_user_id, product_id, price_id, provider, organization_id from public.orders where id = ${p.orderId} for update`;
    if (!order) return { outcome: "not_payable" as const };
    if (order.status === "paid" || order.status === "refunded") return { outcome: "already_paid" as const };
    if (order.provider !== p.provider) return { outcome: "not_payable" as const };
    if (order.status !== "pending" && order.status !== "expired") {
      // Customer paid for a cancelled/failed order: record for manual refund, never silently grant.
      await alert(tx, "payment.on_closed_order", p);
      return { outcome: "not_payable" as const };
    }
    if (p.amountMnt !== order.total_mnt) {
      await alert(tx, "payment.amount_mismatch", { ...p, expected: order.total_mnt });
      return { outcome: "amount_mismatch" as const };
    }

    await tx`insert into public.payments (order_id, provider, provider_payment_id, amount_mnt, status, is_demo, raw)
             values (${order.id}, ${p.provider}, ${p.providerPaymentId}, ${p.amountMnt}, 'paid', ${p.isDemo}, ${tx.json((p.raw ?? {}) as never)})`;
    await tx`update public.orders set status = 'paid', paid_at = now() where id = ${order.id}`;
    await tx`update public.coupon_redemptions set status = 'consumed' where order_id = ${order.id} and status = 'reserved'`;
    // An expired order whose coupon was released gets re-counted if it is actually paid.
    await tx`update public.coupon_redemptions set status = 'consumed' where order_id = ${order.id} and status = 'released'`;

    await grantForOrder(tx, order, p.isDemo);

    await tx`insert into public.outbox_events (topic, payload, dedupe_key) values ('order.paid', ${tx.json({ order_id: order.id })}, ${"order.paid:" + order.id})
             on conflict (dedupe_key) do nothing`;
    await tx`insert into public.product_events (user_id, event_name, properties) values (${order.buyer_user_id}, 'payment_verified', ${tx.json({ order_id: order.id, provider: p.provider, demo: p.isDemo })})`;
    return { outcome: "granted" as const };
  });
}

async function alert(tx: Tx, topic: string, payload: unknown) {
  await tx`insert into public.outbox_events (topic, payload) values (${topic}, ${tx.json(payload as never)})`;
}

async function grantForOrder(tx: Tx, order: { id: string; buyer_user_id: string; product_id: string; price_id: string }, isDemo: boolean) {
  const [pp] = (await tx<{ kind: string; scope_kind: string; scope_course_id: string | null; access_days: number | null; billing_interval: string; auto_renew: boolean }[]>`
    select p.kind, p.scope_kind, p.scope_course_id, pr.access_days, pr.billing_interval, pr.auto_renew
    from public.products p join public.prices pr on pr.id = ${order.price_id} where p.id = ${order.product_id}`) as unknown as [
    { kind: string; scope_kind: string; scope_course_id: string | null; access_days: number | null; billing_interval: string; auto_renew: boolean },
  ];

  if (pp.kind === "library_plan") {
    // Prepaid term. If the learner already has time left on the same scope, the new term starts when it ends.
    const [{ start }] = (await tx<{ start: Date }[]>`
      select greatest(now(), coalesce(max(e.valid_until), now())) as start
      from public.entitlements e
      where e.subject_user_id = ${order.buyer_user_id} and e.status = 'active' and e.source_kind = 'subscription'
        and e.scope_kind = ${pp.scope_kind} and e.valid_until > now()`) as unknown as [{ start: Date }];
    const days = pp.access_days ?? (pp.billing_interval === "year" ? 365 : 30);
    const [sub] = (await tx<{ id: string; current_period_end: Date }[]>`
      insert into public.subscriptions (user_id, price_id, provider, status, auto_renew, current_period_start, current_period_end, source_order_id)
      select ${order.buyer_user_id}, ${order.price_id}, o.provider, 'active', ${pp.auto_renew}, ${start}, ${start}::timestamptz + make_interval(days => ${days}), o.id
      from public.orders o where o.id = ${order.id}
      on conflict (source_order_id) where source_order_id is not null do nothing
      returning id, current_period_end`) as unknown as [{ id: string; current_period_end: Date } | undefined];
    if (!sub) return; // already granted
    await tx`insert into public.entitlements (subject_user_id, scope_kind, source_kind, source_id, valid_from, valid_until, is_demo)
             values (${order.buyer_user_id}, ${pp.scope_kind}, 'subscription', ${sub.id}, ${start}, ${sub.current_period_end}, ${isDemo})
             on conflict (source_kind, source_id, subject_user_id) do nothing`;
    return;
  }
  if (pp.kind === "bundle" || pp.kind === "course") {
    const validUntil = pp.access_days ? new Date(Date.now() + pp.access_days * 86_400_000) : null;
    await tx`insert into public.entitlements (subject_user_id, scope_kind, scope_course_id, scope_bundle_product_id, source_kind, source_id, valid_until, is_demo)
             values (${order.buyer_user_id}, ${pp.scope_kind}, ${pp.kind === "course" ? pp.scope_course_id : null},
                     ${pp.kind === "bundle" ? order.product_id : null}, 'order', ${order.id}, ${validUntil}, ${isDemo})
             on conflict (source_kind, source_id, subject_user_id) do nothing`;
    return;
  }
  // B2B seats are provisioned by invoice workflow (seat pools), never via B2C checkout.
  throw new Error(`unsupported product kind for checkout: ${pp.kind}`);
}

/**
 * Refund bookkeeping after the provider confirms a refund. Access derived from
 * the order is revoked; learning history and already-issued credentials are kept
 * (credential revocation is a separate, audited decision).
 */
export async function recordConfirmedRefund(orderId: string, amountMnt: number, reason: string, actorId: string | null) {
  return withService(async (tx) => {
    const [pay] = await tx<{ id: string; amount_mnt: number }[]>`select id, amount_mnt from public.payments where order_id = ${orderId} for update`;
    if (!pay) throw new Error("no payment for order");
    await tx`insert into public.refunds (payment_id, amount_mnt, reason, status, created_by) values (${pay.id}, ${amountMnt}, ${reason}, 'succeeded', ${actorId})`;
    const full = amountMnt >= pay.amount_mnt;
    await tx`update public.payments set status = ${full ? "refunded" : "partially_refunded"} where id = ${pay.id}`;
    if (full) {
      await tx`update public.orders set status = 'refunded' where id = ${orderId}`;
      await tx`update public.entitlements set status = 'revoked', revoked_reason = 'refund'
               where (source_kind = 'order' and source_id = ${orderId})
                  or (source_kind = 'subscription' and source_id in (select id from public.subscriptions where source_order_id = ${orderId}))`;
      await tx`update public.subscriptions set status = 'canceled' where source_order_id = ${orderId}`;
    }
    await tx`insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
             values (${actorId}, 'refund.recorded', 'order', ${orderId}, ${tx.json({ amountMnt, reason, full })})`;
  });
}
