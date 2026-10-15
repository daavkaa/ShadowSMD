import { notFound } from "next/navigation";
import Link from "next/link";
import { ButtonLink, Card, ProgressBar } from "@/components/ui";
import { SparkGuide, TrophyBadge } from "@/components/ui/Illustrations";
import { LearningMap } from "@/components/learn/LearningMap";
import { getCourseMap, getLearnerStats, countUpcomingReviews } from "@/features/learning/service";
import { assertLocale, currentUser } from "@/lib/page-context";

export const metadata = { title: "Суралцах зам" };

export default async function LearnPage({ params }: { params: Promise<{ locale: string; course: string }> }) {
  const { locale: l, course } = await params;
  const locale = assertLocale(l);
  const user = await currentUser();
  const map = await getCourseMap(user?.id ?? null, course);
  if (!map) notFound();
  const stats = user ? await getLearnerStats(user.id) : null;
  const reviews = user ? await countUpcomingReviews(user.id) : null;
  const current = map.nodes.find((n) => n.state === "current");
  const firstPremiumLocked = map.nodes.find((n) => n.state === "premium_locked");

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{map.course.title}</h1>
        <div className="mt-4 max-w-md">
          <ProgressBar value={map.completedLevels} max={map.totalLevels} label="Түвшний ахиц" />
        </div>
        <div className="mt-6">
          <LearningMap nodes={map.nodes} locale={locale} courseSlug={map.course.slug} />
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        {stats && (
          <Card>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div><dt className="text-xs font-bold text-muted">XP</dt><dd className="text-xl font-extrabold">{stats.xp}</dd></div>
              <div><dt className="text-xs font-bold text-muted">Цуваа</dt><dd className="text-xl font-extrabold">{stats.current_days} өдөр</dd></div>
              <div><dt className="text-xs font-bold text-muted">Хичээл</dt><dd className="text-xl font-extrabold">{stats.lessons}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">Завсарласан ч асуудалгүй — XP хасагдахгүй, ахиц хадгалагдана.</p>
          </Card>
        )}
        {!user && (
          <Card>
            <div className="flex items-center gap-3"><SparkGuide size={48} /><p className="font-bold">Ахицаа хадгалахын тулд бүртгүүл.</p></div>
            <ButtonLink href={`/${locale}/login?next=/${locale}/learn/${course}`} className="mt-4 w-full">Үнэгүй эхлэх</ButtonLink>
          </Card>
        )}
        {user && current && current.kind === "lesson" && (
          <Card>
            <p className="text-sm font-bold text-muted">Дараагийн алхам</p>
            <p className="mt-1 font-extrabold">Түвшин {current.level}: {current.title}</p>
            <ButtonLink href={`/${locale}/lessons/${current.id}`} className="mt-4 w-full" data-testid="continue-lesson">Үргэлжлүүлэх</ButtonLink>
          </Card>
        )}
        {reviews && reviews.due > 0 && (
          <Card>
            <p className="font-extrabold">Давтах {reviews.due} асуулт байна</p>
            <Link href={`/${locale}/review`} className="mt-2 inline-block font-bold text-primary-strong hover:underline">Давтлага руу</Link>
          </Card>
        )}
        {firstPremiumLocked && (
          <Card className="bg-ink text-white">
            <div className="flex items-center gap-3"><TrophyBadge size={56} locked /><p className="font-extrabold">Premium түвшин ба эцсийн сертификат</p></div>
            <p className="mt-2 text-sm text-lavender">Ads Manager, targeting, аналитик болон эцсийн шалгалт Premium эрхээр нээгдэнэ. Нөхцөлөө төлөхөөс өмнө бүрэн харна.</p>
            <ButtonLink href={`/${locale}/unlock/${course}`} variant="secondary" className="mt-4 w-full">Нөхцөл ба үнэ харах</ButtonLink>
          </Card>
        )}
      </aside>
    </div>
  );
}
