import Link from "next/link";
import { Card, PageTitle, formatDate } from "@/components/ui";
import { ReviewSession } from "@/components/learn/ReviewSession";
import { countUpcomingReviews, listDueReviews } from "@/features/learning/service";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Давтлага" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await requirePageUser(locale, `/${locale}/review`);
  const [due, counts] = await Promise.all([listDueReviews(user.id), countUpcomingReviews(user.id)]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle sub="Эхний оролдлогоор алдсан асуултууд 1, 3, 7 хоногийн давтамжтай эргэн ирнэ (туршилтын тохиргоо).">Давтлага</PageTitle>
      {due.length === 0 ? (
        <Card>
          <p className="font-bold">Одоогоор давтах асуулт алга 🎉</p>
          <p className="mt-1 text-sm text-muted">Удахгүй давтах: {counts.later} асуулт.</p>
          <Link href={`/${locale}/learn/smm-foundations`} className="mt-3 inline-block font-bold text-primary-strong underline">Суралцах зам руу</Link>
        </Card>
      ) : (
        <ReviewSession locale={locale} items={due.map((d) => ({ id: d.step_id, kind: d.kind, content: d.content, lesson_title: d.lesson_title, due: formatDate(d.next_review_at) }))} />
      )}
    </div>
  );
}
