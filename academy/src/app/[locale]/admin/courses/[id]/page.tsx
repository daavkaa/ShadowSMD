import { notFound } from "next/navigation";
import { Badge, Card, PageTitle } from "@/components/ui";
import { PublishButton, StepEditor } from "@/components/admin/StepEditor";
import { getCourseForAdmin } from "@/features/admin/service";
import { isAppError } from "@/lib/errors";
import { assertLocale, requirePageUser } from "@/lib/page-context";
import { isUuidLike } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function AdminCourse({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = assertLocale(l);
  if (!isUuidLike(id)) notFound();
  const user = await requirePageUser(locale, `/${locale}/admin/courses/${id}`);
  let data;
  try {
    data = await getCourseForAdmin(user.id, id);
  } catch (e) {
    if (isAppError(e) && (e.code === "forbidden" || e.code === "not_found")) notFound();
    throw e;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageTitle sub={`v${data.course.version} · ${data.course.slug}`}>{data.course.title}</PageTitle>
      <Card><PublishButton courseId={data.course.id} /></Card>
      {data.lessons.map((l) => (
        <Card key={l.id}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Түвшин {l.sort_order}. {l.title}</h2>
            <Badge tone={l.access_tier === "free" ? "success" : "primary"}>{l.access_tier}</Badge>
          </div>
          <div className="space-y-3">
            {data.steps.filter((s) => s.lesson_id === l.id).map((s) => (
              <StepEditor key={s.id} step={{ id: s.id, kind: s.kind, sort_order: s.sort_order, points: s.points, content: s.content, answer: s.answer, explanation: s.explanation ?? "" }} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
