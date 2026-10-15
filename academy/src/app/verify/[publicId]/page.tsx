import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, formatDate } from "@/components/ui";
import { LogoMark } from "@/components/ui/Illustrations";
import { verifyCredential } from "@/features/credentials/service";
import { track } from "@/features/analytics/track";

export const metadata: Metadata = { title: "Сертификат баталгаажуулах", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const v = await verifyCredential(publicId);
  await track(null, "verify_viewed", { found: Boolean(v) });
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link href="/mn" className="mb-6 flex items-center gap-2 font-extrabold"><LogoMark /> Skills Academy</Link>
      <Card>
        <h1 className="text-xl font-extrabold">Сертификат баталгаажуулалт</h1>
        {!v ? (
          <div className="mt-4" data-testid="verify-status" data-status="invalid">
            <Badge tone="danger">Олдсонгүй</Badge>
            <p className="mt-2 text-muted">Ийм дугаартай сертификат манай бүртгэлд алга. Холбоосоо шалгана уу.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3" data-testid="verify-status" data-status={v.status}>
            <div className="flex gap-2">
              {v.status === "valid" && <Badge tone="success">Хүчинтэй</Badge>}
              {v.status === "revoked" && <Badge tone="danger">Цуцлагдсан</Badge>}
              {v.status === "expired" && <Badge tone="warning">Хугацаа дууссан</Badge>}
              {v.is_demo && <Badge tone="warning">ДЕМО — бодит төлбөргүй туршилтын эрхээр олгосон</Badge>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Сертификат</dt><dd className="font-bold">{v.credential_title}</dd>
              <dt className="text-muted">Эзэмшигч</dt><dd className="font-bold">{v.holder_name ?? "Эзэмшигч нэрээ нуусан"}</dd>
              <dt className="text-muted">Дугаар</dt><dd>{v.credential_number}</dd>
              <dt className="text-muted">Олгосон</dt><dd>{formatDate(v.issued_at)}</dd>
              <dt className="text-muted">Олгогч</dt><dd>{v.issuer_name}</dd>
            </dl>
            <p className="text-xs text-muted">Энэ нь хувийн сургалтын байгууллагын олгосон сертификат бөгөөд Meta Platforms болон төрийн магадлан итгэмжлэлийн баталгаа биш. Шалгалтын дэлгэрэнгүй мэдээллийг нийтэд харуулахгүй.</p>
          </div>
        )}
      </Card>
    </main>
  );
}
