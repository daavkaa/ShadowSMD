import Link from "next/link";
import { Badge, Card, PageTitle, formatDate, formatDateTime } from "@/components/ui";
import { listMyEntitlements } from "@/features/entitlements/queries";
import { listMyOrders } from "@/features/commerce/orders";
import { formatMnt } from "@/features/commerce/pricing";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Төлбөр ба эрх" };
export const dynamic = "force-dynamic";

const sourceLabel: Record<string, string> = { subscription: "Урьдчилсан хугацаат эрх", order: "Нэг удаагийн худалдан авалт", seat: "Байгууллагын суудал", admin_grant: "Админы олгосон" };
const stateTone = { active: "success", scheduled: "primary", expired: "neutral", revoked: "danger" } as const;
const stateLabel = { active: "Идэвхтэй", scheduled: "Эхлэх хүлээгдэж буй", expired: "Хугацаа дууссан", revoked: "Цуцлагдсан" };
const orderLabel: Record<string, string> = { pending: "Хүлээгдэж буй", paid: "Төлөгдсөн", failed: "Амжилтгүй", expired: "Хугацаа дууссан", cancelled: "Цуцалсан", refunded: "Буцаагдсан" };

export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await requirePageUser(locale, `/${locale}/me/billing`);
  const [ents, orders] = await Promise.all([listMyEntitlements(user.id), listMyOrders(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle sub="Эрх дуусахад суралцсан түүх, сертификат тань хадгалагдана.">Төлбөр ба эрх</PageTitle>
      <Card>
        <h2 className="text-lg font-extrabold">Хандах эрх</h2>
        {ents.length === 0 ? (
          <p className="mt-2 text-muted">Одоогоор зөвхөн үнэгүй түвшнүүд нээлттэй. <Link className="font-bold text-primary-strong underline" href={`/${locale}/unlock/smm-foundations`}>Premium нээх</Link></p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {ents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-bold">{e.scope_label}</p>
                  <p className="text-sm text-muted">
                    {sourceLabel[e.source_kind]}{e.organization_name ? ` · ${e.organization_name}` : ""} · {formatDate(e.valid_from)} – {e.valid_until ? formatDate(e.valid_until) : "хугацаагүй (үйлчилгээ ажиллаж буй хугацаанд)"}
                  </p>
                  {e.source_kind === "subscription" && <p className="text-xs text-muted">Автоматаар сунгагдахгүй — дараагийн төлбөр татагдахгүй.</p>}
                </div>
                <div className="flex gap-2">
                  {e.is_demo && <Badge tone="warning">ДЕМО</Badge>}
                  <Badge tone={stateTone[e.state]}>{stateLabel[e.state]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-extrabold">Захиалгын түүх</h2>
        {orders.length === 0 ? <p className="mt-2 text-muted">Захиалга алга.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-bold">{o.product_name}</p>
                  <p className="text-muted">{formatDateTime(o.created_at)} · {o.provider === "demo" ? "Демо" : o.provider.toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold">{formatMnt(o.total_mnt)}</span>
                  {o.status === "pending" ? <Link href={`/${locale}/checkout/${o.id}`} className="font-bold text-primary-strong underline">{orderLabel[o.status]}</Link> : <Badge>{orderLabel[o.status]}</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">И-баримт / нэхэмжлэх нь төлбөрийн гэрээ, татварын бүртгэл баталгаажсаны дараа идэвхжинэ.</p>
      </Card>
    </div>
  );
}
