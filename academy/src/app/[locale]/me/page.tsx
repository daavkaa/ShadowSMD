import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { NameVisibilityToggle } from "@/components/NameVisibilityToggle";
import { getProfile } from "@/features/catalog/profile";
import { getLearnerStats } from "@/features/learning/service";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Профайл" };

export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await requirePageUser(locale, `/${locale}/me`);
  const [profile, stats] = await Promise.all([getProfile(user.id), getLearnerStats(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle sub={user.email ?? undefined}>{profile?.display_name || "Профайл"}</PageTitle>
      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><dt className="text-xs font-bold text-muted">Нийт XP</dt><dd className="text-2xl font-extrabold">{stats.xp}</dd></div>
          <div><dt className="text-xs font-bold text-muted">Дууссан хичээл</dt><dd className="text-2xl font-extrabold">{stats.lessons}</dd></div>
          <div><dt className="text-xs font-bold text-muted">Одоогийн цуваа</dt><dd className="text-2xl font-extrabold">{stats.current_days}</dd></div>
          <div><dt className="text-xs font-bold text-muted">Хамгийн урт цуваа</dt><dd className="text-2xl font-extrabold">{stats.best_days}</dd></div>
        </dl>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><Link href={`/${locale}/me/certificates`} className="text-lg font-extrabold text-primary-strong hover:underline">Миний сертификатууд →</Link><p className="mt-1 text-sm text-muted">Татах, баталгаажуулах холбоос, LinkedIn.</p></Card>
        <Card><Link href={`/${locale}/me/billing`} className="text-lg font-extrabold text-primary-strong hover:underline">Төлбөр ба эрх →</Link><p className="mt-1 text-sm text-muted">Идэвхтэй эрх, дуусах хугацаа, захиалгын түүх.</p></Card>
      </div>
      <Card>
        <h2 className="text-lg font-extrabold">Нууцлал</h2>
        <NameVisibilityToggle initial={profile?.show_name_on_credentials ?? true} />
        <p className="mt-3 text-sm text-muted">Өгөгдлөө татаж авах эсвэл бүртгэлээ устгах хүсэлтийг support@example.mn хаягаар илгээнэ үү (автомат хэрэгсэл P1-д).</p>
      </Card>
    </div>
  );
}
