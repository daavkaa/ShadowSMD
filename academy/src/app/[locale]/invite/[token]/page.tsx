import { Card, PageTitle } from "@/components/ui";
import { AcceptInvite } from "@/components/org/AcceptInvite";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Байгууллагын урилга" };

export default async function InvitePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale: l, token } = await params;
  const locale = assertLocale(l);
  const user = await requirePageUser(locale, `/${locale}/invite/${token}`);
  return (
    <div className="mx-auto max-w-lg">
      <PageTitle>Байгууллагын урилга</PageTitle>
      <Card>
        <p>Та <strong>{user.email}</strong> хаягаар нэвтэрсэн байна. Урилга энэ имэйл рүү илгээгдсэн бол хүлээн авна уу.</p>
        <p className="mt-3 text-sm text-muted">
          Хүлээн авснаар байгууллагын менежер таны хичээлийн явцын нэгтгэсэн мэдээлэл (дууссан түвшний тоо, эцсийн шалгалтад тэнцсэн эсэх, сертификатын дугаар)-ийг харна.
          Таны хариултууд, имэйл болон бусад хувийн мэдээлэл харагдахгүй. Ахиц, сертификат тань өөрт тань үлдэнэ.
        </p>
        <AcceptInvite locale={locale} token={token} />
      </Card>
    </div>
  );
}
