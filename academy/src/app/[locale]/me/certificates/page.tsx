import Link from "next/link";
import { Badge, Card, PageTitle, formatDate } from "@/components/ui";
import { listMyCredentials, verificationUrl } from "@/features/credentials/service";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Миний сертификатууд" };
export const dynamic = "force-dynamic";

export default async function CertificatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await requirePageUser(locale, `/${locale}/me/certificates`);
  const creds = await listMyCredentials(user.id);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle sub="Олгогч нь академи. Meta болон төрийн магадлан итгэмжлэлийн баталгаа биш.">Миний сертификатууд</PageTitle>
      {creds.length === 0 && (
        <Card><p>Одоогоор сертификат алга. Эцсийн шалгалтад тэнцсэний дараа энд харагдана.</p><Link href={`/${locale}/learn/smm-foundations`} className="mt-2 inline-block font-bold text-primary-strong underline">Суралцах зам</Link></Card>
      )}
      {creds.map((c) => {
        const url = verificationUrl(c.public_id);
        const issued = new Date(c.issued_at);
        const linkedIn = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(c.credential_title)}&issueYear=${issued.getUTCFullYear()}&issueMonth=${issued.getUTCMonth() + 1}&certUrl=${encodeURIComponent(url)}&certId=${encodeURIComponent(c.credential_number)}`;
        return (
          <Card key={c.id} data-testid="credential-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold">{c.credential_title}</h2>
                <p className="text-sm text-muted">{c.credential_number} · {formatDate(c.issued_at)} · {c.score_pct}%</p>
              </div>
              <div className="flex gap-2">
                {c.is_demo && <Badge tone="warning">ДЕМО</Badge>}
                {c.revoked_at ? <Badge tone="danger">Цуцлагдсан</Badge> : <Badge tone="success">Хүчинтэй</Badge>}
              </div>
            </div>
            {c.revoked_at && <p className="mt-2 text-sm text-danger">Шалтгаан: {c.revoke_reason}</p>}
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
              <a href={`/api/me/certificates/${c.id}/download`} className="text-primary-strong underline" data-testid="download-pdf">PDF татах</a>
              <Link href={`/verify/${c.public_id}`} className="text-primary-strong underline">Баталгаажуулах хуудас</Link>
              {!c.revoked_at && <a href={linkedIn} target="_blank" rel="noopener noreferrer" className="text-primary-strong underline">LinkedIn-д нэмэх</a>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
