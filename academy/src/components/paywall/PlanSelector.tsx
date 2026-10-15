"use client";
import { useState } from "react";
import { Alert, Button, ButtonLink, Badge, cx } from "@/components/ui";
import { formatMnt, vatIncluded, yearlySavings } from "@/features/commerce/pricing";
import { postJson } from "@/lib/client/api";

type Plan = {
  price_code: string;
  product_code: string;
  name: string;
  description: string;
  amount_mnt: number;
  billing_interval: "one_time" | "month" | "year";
  access_days: number | null;
  auto_renew: boolean;
  requires_student_verification: boolean;
  bundleTitles: string[];
};

export function PlanSelector({ plans, locale, signedIn, returnTo }: { plans: Plan[]; locale: string; signedIn: boolean; returnTo: string }) {
  const buyable = plans.filter((p) => !p.requires_student_verification);
  const student = plans.filter((p) => p.requires_student_verification);
  const [selected, setSelected] = useState<string | null>(null); // no pre-selected upsell
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const monthly = buyable.find((p) => p.product_code === "pro_library" && p.billing_interval === "month");
  const yearly = buyable.find((p) => p.product_code === "pro_library" && p.billing_interval === "year");
  const savings = monthly && yearly ? yearlySavings(monthly.amount_mnt, yearly.amount_mnt) : null;
  const sel = buyable.find((p) => p.price_code === selected);

  async function checkout() {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    const r = await postJson<{ orderId: string }>("/api/orders", { priceCode: selected, couponCode: coupon || undefined });
    if (r.ok) window.location.assign(`/${locale}/checkout/${r.data.orderId}`);
    else {
      setErr(r.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">Төлөвлөгөө</legend>
        <div className="space-y-3">
          {buyable.map((p) => (
            <label key={p.price_code} className={cx("block cursor-pointer rounded-2xl border-2 p-4", selected === p.price_code ? "border-primary bg-lavender-soft" : "border-line")}>
              <div className="flex items-start gap-3">
                <input type="radio" name="plan" value={p.price_code} checked={selected === p.price_code} onChange={() => setSelected(p.price_code)} className="mt-1 h-5 w-5 accent-[var(--color-primary)]" data-testid={`plan-${p.price_code}`} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-extrabold">
                      {p.billing_interval === "month" ? "Professional — 30 хоног" : p.billing_interval === "year" ? "Professional — 365 хоног" : p.name}
                    </span>
                    <span className="text-xl font-extrabold">{formatMnt(p.amount_mnt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {p.billing_interval !== "one_time" && <Badge tone="warning">Урьдчилсан төлбөр · автоматаар сунгагдахгүй</Badge>}
                    {p.billing_interval === "one_time" && <Badge>Нэг удаагийн төлбөр</Badge>}
                    {p.billing_interval === "year" && savings && <Badge tone="success">Сард ≈{formatMnt(savings.perMonth)} · 30 хоногийн 12 багцаас {formatMnt(savings.saved)} ({savings.pct}%) хямд</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-muted">{p.description}</p>
                  {p.bundleTitles.length > 0 && (
                    <p className="mt-1 text-xs text-muted">Багцад: {p.bundleTitles.join(", ")} (ирээдүйд нээгдэх сургалтыг багтаасан бол тухайн үед нь нээгдэнэ). Үйлчилгээ ажиллаж буй хугацаанд худалдан авсан агуулгад хандана.</p>
                  )}
                  {p.billing_interval !== "one_time" && (
                    <p className="mt-1 text-xs text-muted">{p.access_days} хоногийн хандалт. Хугацаа дуусахад автоматаар төлбөр татагдахгүй; хүсвэл дахин сунгана. Ахиц, сертификат хадгалагдана.</p>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {student.length > 0 && (
        <p className="text-xs text-muted">Оюутны үнэ ({student.map((s) => formatMnt(s.amount_mnt)).join(" / ")}) — оюутны эрх баталгаажуулах боломж нээгдсэний дараа худалдаалагдана.</p>
      )}

      <div>
        <label htmlFor="coupon" className="text-sm font-bold">Промо код (заавал биш)</label>
        <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} maxLength={32} className="mt-1 w-full rounded-xl border-2 border-line px-4 py-2.5 uppercase" />
      </div>

      {sel && (
        <div className="rounded-2xl bg-canvas p-4 text-sm" aria-live="polite">
          <p className="flex justify-between gap-3"><span>Сонгосон</span><span className="text-right font-bold">{sel.name}</span></p>
          <p className="flex justify-between"><span>Үнэ (НӨАТ багтсан*)</span><span className="font-bold">{formatMnt(sel.amount_mnt)}</span></p>
          <p className="flex justify-between text-muted"><span>Үүнээс НӨАТ (10%)*</span><span>{formatMnt(vatIncluded(sel.amount_mnt))}</span></p>
          <p className="mt-2 text-xs text-muted">*Татварын тооцоог нягтлан бодогчоор баталгаажуулна. Промо кодыг дараагийн алхамд сервер шалгаж эцсийн дүнг харуулна.</p>
        </div>
      )}

      {err && <Alert tone="danger" role="alert">{err}</Alert>}
      {signedIn ? (
        <Button onClick={() => void checkout()} disabled={!selected || busy} className="w-full" data-testid="checkout-button">
          Төлбөрийн нөхцөл ба QR руу
        </Button>
      ) : (
        <ButtonLink href={`/${locale}/login?next=${encodeURIComponent(returnTo)}`} className="w-full">Нэвтэрч үргэлжлүүлэх</ButtonLink>
      )}
      <p className="text-xs text-muted">Дараагийн алхамд захиалгын дүн, хугацаа, нөхцөлийг харсны дараа л төлбөр хийнэ. Буцаалтын нөхцөл: <a className="underline" href="#refund">нөхцөл (ноорог)</a>.</p>
    </div>
  );
}
