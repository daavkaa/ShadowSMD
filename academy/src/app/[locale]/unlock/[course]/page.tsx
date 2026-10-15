import { notFound } from "next/navigation";
import Link from "next/link";
import { Alert, Card, ProgressBar } from "@/components/ui";
import { TrophyBadge } from "@/components/ui/Illustrations";
import { PlanSelector } from "@/components/paywall/PlanSelector";
import { getCourseBySlug, listBundleCourseTitles, listPlans } from "@/features/catalog/queries";
import { getCourseMap } from "@/features/learning/service";
import { track } from "@/features/analytics/track";
import { assertLocale, currentUser } from "@/lib/page-context";

export const metadata = { title: "Premium нээх" };

export default async function UnlockPage({ params }: { params: Promise<{ locale: string; course: string }> }) {
  const { locale: l, course: slug } = await params;
  const locale = assertLocale(l);
  const user = await currentUser();
  const data = await getCourseBySlug(user?.id ?? null, slug);
  if (!data || data.course.status !== "published") notFound();
  const map = await getCourseMap(user?.id ?? null, slug);
  const plans = (await listPlans(user?.id ?? null, data.course.id)).filter((p) => p.covers_course);
  const bundleTitles = await listBundleCourseTitles(user?.id ?? null, "smm_bundle");
  await track(user?.id ?? null, "paywall_viewed", { course: slug });
  const a = data.assessment;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="overflow-hidden bg-ink text-white">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <TrophyBadge size={140} locked={!map?.hasPremium} />
          <div className="flex-1">
            <p className="text-sm font-bold text-lavender">Түвшин {map?.totalLevels ?? 6}: Эцсийн сертификат</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{data.course.title}</h1>
            {map && user && (
              <div className="mt-4 max-w-sm [&_*]:text-white">
                <ProgressBar value={map.completedLevels} max={map.totalLevels} label="Таны бодит ахиц" />
              </div>
            )}
          </div>
        </div>
      </Card>

      {map?.hasPremium && (
        <Alert tone="success" title="Танд Premium эрх идэвхтэй байна">
          <Link href={`/${locale}/learn/${slug}`} className="font-bold underline">Суралцах зам руу буцах</Link>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <h2 className="text-lg font-extrabold">Premium-аар нээгдэх зүйлс</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>✓ Түвшин 4–5: Ads Manager-ийн бүтэц, targeting ба аналитик (практик сценари)</li>
            {a && <li>✓ Эцсийн шалгалт: {a.question_count} асуулт, {a.time_limit_minutes} минут, тэнцэх оноо {a.pass_score_pct}%</li>}
            <li>✓ Онлайнаар шалгагдах сертификат (QR, баталгаажуулах холбоос, PDF), LinkedIn-д нэмэх холбоос</li>
            <li>✓ Алдсан асуултын давтлага</li>
          </ul>
          <Alert tone="warning" title="Анхаарах">
            <p>Төлбөр төлснөөр шалгалт өгөх эрх нээгдэнэ — тэнцэх, сертификат авахыг баталгаажуулахгүй. Шалгалтад тэнцээгүй бол {a ? "24 цагийн" : ""} дараа дахин өгнө.</p>
            <p className="mt-1">Энэ сертификат нь академийн өөрийн олгосон баримт бөгөөд Meta-гийн албан ёсны (Meta Blueprint) сертификат биш.</p>
          </Alert>
          <p className="mt-4 text-sm">
            Шийдвэр гаргахаас өмнө: <Link href={`/${locale}/learn/${slug}`} className="font-bold text-primary-strong underline">үнэгүй 3 түвшнээ</Link> туршиж,
            алдсан асуултаа <Link href={`/${locale}/review`} className="font-bold text-primary-strong underline">давтлагаар</Link> бэхжүүлээрэй.
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-extrabold">Төлөвлөгөө сонгох</h2>
          <PlanSelector
            locale={locale}
            signedIn={Boolean(user)}
            returnTo={`/${locale}/unlock/${slug}`}
            plans={plans.map((p) => ({ ...p, bundleTitles: p.product_code === "smm_bundle" ? bundleTitles : [] }))}
          />
        </Card>
      </div>
    </div>
  );
}
