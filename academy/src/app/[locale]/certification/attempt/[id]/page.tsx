import { notFound } from "next/navigation";
import { ButtonLink, Card } from "@/components/ui";
import { ExamForm } from "@/components/exam/ExamForm";
import { getAttemptForUser } from "@/features/assessments/service";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Шалгалт" };
export const dynamic = "force-dynamic";

export default async function AttemptPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: l, id } = await params;
  const locale = assertLocale(l);
  const user = await requirePageUser(locale, `/${locale}/certification/attempt/${id}`);
  const att = await getAttemptForUser(user.id, id);
  if (!att) notFound();
  if (att.status !== "in_progress") {
    return (
      <Card className="mx-auto max-w-lg">
        <p className="font-bold">Энэ оролдлого хаагдсан байна.</p>
        <ButtonLink href={`/${locale}/certification/${att.course_slug}`} className="mt-4">Сертификатын хуудас руу</ButtonLink>
      </Card>
    );
  }
  return <ExamForm locale={locale} attempt={{ ...att, expires_at: att.expires_at.toISOString() }} />;
}
