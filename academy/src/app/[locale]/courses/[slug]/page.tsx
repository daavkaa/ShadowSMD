import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, PageTitle } from "@/components/ui";
import { getCourseBySlug } from "@/features/catalog/queries";
import { assertLocale, currentUser } from "@/lib/page-context";

export default async function CoursePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: l, slug } = await params;
  const locale = assertLocale(l);
  const user = await currentUser();
  const data = await getCourseBySlug(user?.id ?? null, slug);
  if (!data) notFound();
  const { course, lessons, assessment } = data;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle sub={`${course.academy_title} · ${course.track_title}`}>{course.title}</PageTitle>
      {course.status === "coming_soon" ? (
        <Card><Badge>Тун удахгүй</Badge><p className="mt-2 text-muted">{course.summary}</p><p className="mt-2 text-sm text-muted">Энэ сургалт одоогоор худалдаалагдахгүй.</p></Card>
      ) : (
        <>
          <Card>
            <p>{course.summary}</p>
            <p className="mt-3 text-sm text-muted">
              ~{course.estimated_minutes} минут · Агуулгыг сүүлд хянасан: {course.reviewed_at ?? "—"} · Meta-ийн интерфэйс, бодлого өөрчлөгдөж болохыг анхаарна уу.
            </p>
            <ButtonLink href={`/${locale}/learn/${course.slug}`} className="mt-4">{user ? "Суралцах зам руу" : "Үнэгүй эхлэх"}</ButtonLink>
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-extrabold">Хөтөлбөр</h2>
            <ol className="space-y-3">
              {lessons.map((ls, i) => (
                <li key={ls.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">Түвшин {i + 1}. {ls.title}</p>
                    <p className="text-sm text-muted">{ls.summary} · ~{ls.estimated_minutes} мин</p>
                  </div>
                  <Badge tone={ls.access_tier === "free" ? "success" : "primary"}>{ls.access_tier === "free" ? "Үнэгүй" : "Premium"}</Badge>
                </li>
              ))}
              {assessment && (
                <li className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">Түвшин {lessons.length + 1}. Эцсийн сертификат</p>
                    <p className="text-sm text-muted">{assessment.question_count} асуулт · {assessment.time_limit_minutes} минут · тэнцэх оноо {assessment.pass_score_pct}%</p>
                  </div>
                  <Badge tone="primary">Premium</Badge>
                </li>
              )}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
