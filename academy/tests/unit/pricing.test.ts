import { describe, expect, it } from "vitest";
import { assertCouponUsable, computeAmounts, formatMnt, normalizeCouponCode, vatIncluded, yearlySavings, type CouponRow } from "@/features/commerce/pricing";

const coupon = (o: Partial<CouponRow> = {}): CouponRow => ({
  id: "c1", code: "PILOT10", discount_type: "percent", value: 10, usage_limit: 10, used_count: 0, per_user_limit: 1,
  applies_to_price_ids: null, starts_at: null, expires_at: null, active: true, ...o,
});
const now = new Date("2026-10-15T00:00:00Z");

describe("pricing", () => {
  it("computes amounts in integer MNT", () => {
    expect(computeAmounts(29900, 1, null)).toEqual({ subtotal: 29900, discount: 0, total: 29900 });
    expect(computeAmounts(249000, 1, { discount_type: "percent", value: 10 })).toEqual({ subtotal: 249000, discount: 24900, total: 224100 });
    expect(computeAmounts(15900, 10, { discount_type: "fixed_mnt", value: 9000 })).toEqual({ subtotal: 159000, discount: 9000, total: 150000 });
  });
  it("refuses zero-total orders (no access without a payment record)", () => {
    expect(() => computeAmounts(29900, 1, { discount_type: "percent", value: 100 })).toThrow(/zero_total/);
    expect(() => computeAmounts(29900, 1, { discount_type: "fixed_mnt", value: 50000 })).toThrow(/zero_total/);
  });
  it("derives yearly savings from real prices (brief example 109,800 ≈ 30.6%)", () => {
    expect(yearlySavings(29900, 249000)).toEqual({ twelve: 358800, saved: 109800, pct: 30.6, perMonth: 20750 });
  });
  it("computes VAT contained in an inclusive price", () => {
    expect(vatIncluded(29900)).toBe(2718);
  });
  it("formats MNT", () => {
    expect(formatMnt(249000)).toBe("249,000₮");
  });
});

describe("coupon eligibility", () => {
  it("accepts a valid coupon", () => expect(() => assertCouponUsable(coupon(), "p1", 0, now)).not.toThrow());
  it("rejects inactive / future / expired / exhausted / per-user / wrong price", () => {
    expect(() => assertCouponUsable(coupon({ active: false }), "p1", 0, now)).toThrow(/coupon_invalid/);
    expect(() => assertCouponUsable(coupon({ starts_at: new Date("2027-01-01") }), "p1", 0, now)).toThrow(/coupon_invalid/);
    expect(() => assertCouponUsable(coupon({ expires_at: new Date("2026-10-14") }), "p1", 0, now)).toThrow(/coupon_expired/);
    expect(() => assertCouponUsable(coupon({ used_count: 10 }), "p1", 0, now)).toThrow(/coupon_exhausted/);
    expect(() => assertCouponUsable(coupon(), "p1", 1, now)).toThrow(expect.objectContaining({ code: "coupon_exhausted" }));
    expect(() => assertCouponUsable(coupon({ applies_to_price_ids: ["p2"] }), "p1", 0, now)).toThrow(/coupon_not_applicable/);
  });
  it("normalizes codes", () => expect(normalizeCouponCode("  pilot10 ")).toBe("PILOT10"));
});
