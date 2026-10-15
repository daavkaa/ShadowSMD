import { notFound, redirect } from "next/navigation";
import { ButtonLink, Card } from "@/components/ui";
import { LessonPlayer } from "@/components/learn/LessonPlayer";
import { getLessonForPlayer } from "@/features/learning/service";
import { isAppError } from "@/lib/errors";
import { assertLocale, requirePageUser } from "@/lib/page-context";
import { isUuidLike } from "@/lib/validation";

export const metadata = { title: "Хичээл" };

export default async function LessonPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = assertLocale(l);
  if (!isUuidLike(id)) notFound();
  const user = await requirePageUser(locale, `/${locale}/lessons/${id}`);
  let data;
  try {
    data = await getLessonForPlayer(user.id, id);
  } catch (e) {
    if (isAppError(e) && e.code === "premium_required") redirect(`/${locale}/unlock/${String(e.details?.courseSlug ?? "smm-foundations")}`);
    if (isAppError(e) && e.code === "prerequisite_incomplete") {
      return (
        <Card className="mx-auto max-w-lg">
          <h1 className="text-xl font-extrabold">Энэ түвшин хараахан нээгдээгүй</h1>
          <p className="mt-2 text-muted">Өмнөх түвшнээ дуусгасны дараа нээгдэнэ.</p>
          <ButtonLink href={`/${locale}/learn/smm-foundations`} className="mt-4">Зам руу буцах</ButtonLink>
        </Card>
      );
    }
    if (isAppError(e) && e.code === "not_found") notFound();
    throw e;
  }
  return (
    <LessonPlayer
      locale={locale}
      courseSlug={data.lesson.course_slug}
      lesson={{ id: data.lesson.id, title: data.lesson.title, sort_order: data.lesson.sort_order }}
      steps={data.steps}
      answered={data.answered}
    />
  );
}
