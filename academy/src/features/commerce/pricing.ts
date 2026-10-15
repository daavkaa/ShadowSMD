import { AppError } from "@/lib/errors";

export type CouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed_mnt";
  value: number;
  usage_limit: number | null;
  used_count: number;
  per_user_limit: number;
  applies_to_price_ids: string[] | null;
  starts_at: Date | null;
  expires_at: Date | null;
  active: boolean;
};

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Validates coupon eligibility (pure). userRedemptions = reserved+consumed redemptions by this user. */
export function assertCouponUsable(c: CouponRow, priceId: string, userRedemptions: number, now: Date) {
  if (!c.active) throw new AppError("coupon_invalid");
  if (c.starts_at && c.starts_at > now) throw new AppError("coupon_invalid");
  if (c.expires_at && c.expires_at <= now) throw new AppError("coupon_expired");
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) throw new AppError("coupon_exhausted");
  if (userRedemptions >= c.per_user_limit) throw new AppError("coupon_exhausted", "Already used by this user");
  if (c.applies_to_price_ids && c.applies_to_price_ids.length && !c.applies_to_price_ids.includes(priceId)) throw new AppError("coupon_not_applicable");
}

export function computeAmounts(unitAmount: number, quantity: number, coupon: Pick<CouponRow, "discount_type" | "value"> | null) {
  if (!Number.isInteger(unitAmount) || unitAmount <= 0) throw new Error("unit amount must be a positive integer");
  if (!Number.isInteger(quantity) || quantity < 1) throw new AppError("invalid_input", "quantity");
  const subtotal = unitAmount * quantity;
  let discount = 0;
  if (coupon) {
    discount = coupon.discount_type === "percent" ? Math.floor((subtotal * coupon.value) / 100) : Math.min(coupon.value, subtotal);
  }
  const total = subtotal - discount;
  // A zero-total "purchase" would grant access without any payment record; not supported in MVP.
  if (total <= 0) throw new AppError("zero_total_not_supported");
  return { subtotal, discount, total };
}

/** Yearly vs monthly savings shown on the plan selector (derived, never hard-coded). */
export function yearlySavings(monthly: number, yearly: number) {
  const twelve = monthly * 12;
  const saved = twelve - yearly;
  return { twelve, saved, pct: twelve > 0 ? Math.round((saved / twelve) * 1000) / 10 : 0, perMonth: Math.round(yearly / 12) };
}

/** VAT portion contained in a VAT-inclusive price (10% Mongolian VAT assumed — confirm with accountant). */
export function vatIncluded(total: number, ratePct = 10) {
  return Math.round((total * ratePct) / (100 + ratePct));
}

export function formatMnt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n) + "₮"; // comma grouping as in the brief (29,900₮)
}
