import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Alert, Badge, Card, PageTitle, formatDateTime } from "@/components/ui";
import { CheckoutStatus } from "@/components/checkout/CheckoutStatus";
import { getOrderForUser } from "@/features/commerce/orders";
import { formatMnt, vatIncluded } from "@/features/commerce/pricing";
import { getEnv } from "@/lib/env";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Төлбөр" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string; order: string }> }) {
  const { locale: l, order: orderId } = await params;
  const locale = assertLocale(l);
  const user = await requirePageUser(locale, `/${locale}/checkout/${orderId}`);
  const order = await getOrderForUser(user.id, orderId);
  if (!order) notFound();
  const env = getEnv();
  const isDemo = order.provider === "demo";
  const qr = order.status === "pending" && order.provider_payload.qrText ? await QRCode.toDataURL(order.provider_payload.qrText, { margin: 1, width: 260 }) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle sub={`Захиалга #${order.id.slice(0, 8)} · ${formatDateTime(order.created_at)}`}>Төлбөр</PageTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-extrabold">Захиалгын дүн</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Бүтээгдэхүүн</dt><dd className="text-right font-bold">{order.product_name}</dd></div>
            <div className="flex justify-between"><dt>Төрөл</dt><dd>{order.billing_interval === "one_time" ? "Нэг удаагийн" : `Урьдчилсан ${order.access_days} хоног · автоматаар сунгагдахгүй`}</dd></div>
            <div className="flex justify-between"><dt>Дүн</dt><dd>{formatMnt(order.subtotal_mnt)}</dd></div>
            {order.discount_mnt > 0 && <div className="flex justify-between text-success"><dt>Хөнгөлөлт</dt><dd>−{formatMnt(order.discount_mnt)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold"><dt>Төлөх дүн</dt><dd data-testid="order-total">{formatMnt(order.total_mnt)}</dd></div>
            <div className="flex justify-between text-muted"><dt>Үүнээс НӨАТ*</dt><dd>{formatMnt(vatIncluded(order.total_mnt))}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            *НӨАТ болон И-баримтын нөхцөлийг нягтлан бодогч, төлбөрийн гэрээгээр баталгаажуулна. Захиалга {formatDateTime(order.expires_at)} хүртэл хүчинтэй.
            Төлбөр баталгаажих хүртэл хандах эрх нээгдэхгүй.
          </p>
          {order.billing_interval !== "one_time" && (
            <p className="mt-2 text-xs text-muted">Энэ нь урьдчилсан хугацаатай эрх: дараагийн сард автоматаар мөнгө татагдахгүй. Автомат сунгалт карт төлбөрийн гэрээ байгуулсны дараа нэмэгдэнэ.</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">{isDemo ? "Демо төлбөр" : "QPay QR"}</h2>
            {isDemo && <Badge tone="warning">ДЕМО · бодит мөнгө шилжихгүй</Badge>}
          </div>
          {isDemo && (
            <Alert tone="warning" title="Энэ бол туршилтын орчин">
              Доорх QR бодит банкны апп-д ажиллахгүй. Хөгжүүлэгч доорх «симуляц» товчоор үйлчилгээ үзүүлэгчийн талд төлбөр хийгдсэнийг дуурайлгаж болно —
              систем тэр төлөвийг үйлчилгээ үзүүлэгчээс дахин шалгаж баталгаажуулсны дараа л эрх нээнэ. Демо эрхээр авсан сертификат «ДЕМО» гэж тэмдэглэгдэнэ.
            </Alert>
          )}
          <CheckoutStatus
            locale={locale}
            orderId={order.id}
            initialStatus={order.status}
            qrDataUrl={qr}
            deeplinks={order.provider_payload.deeplinks ?? []}
            instructions={order.provider_payload.instructions ?? null}
            canSimulate={isDemo && env.stage !== "production"}
          />
        </Card>
      </div>
    </div>
  );
}
