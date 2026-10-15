import { notFound } from "next/navigation";
import { Alert, ButtonLink, Card, ProgressBar, formatDate, formatDateTime } from "@/components/ui";
import { TrophyBadge } from "@/components/ui/Illustrations";
import { StartExamButton } from "@/components/exam/StartExamButton";
import { getCertificationState } from "@/features/assessments/service";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Эцсийн сертификат" };
export const dynamic = "force-dynamic";

export default async function CertificationPage({ params }: { params: Promise<{ locale: string; course: string }> }) {
  const { locale: l, course } = await params;
  const locale = assertLocale(l);
  const user = await requirePageUser(locale, `/${locale}/certification/${course}`);
  const s = await getCertificationState(user.id, course);
  if (!s || !s.assessment) notFound();
  const a = s.assessment;
  const levels = s.lessonsTotal + 1;
  const done = s.lessonsCompleted + (s.credential ? 1 : 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="bg-ink text-white">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <TrophyBadge size={130} locked={s.status === "locked_premium"} />
          <div className="flex-1">
            <p className="text-sm font-bold text-lavender">Түвшин {levels}: Эцсийн сертификат</p>
            <h1 className="mt-1 text-2xl font-extrabold">{s.course.title}</h1>
            <div className="mt-4 max-w-sm [&_*]:text-white"><ProgressBar value={done} max={levels} label="Таны ахиц" /></div>
          </div>
        </div>
      </Card>

      <Card>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li>📝 {a.question_count} асуулт, санамсаргүй сонголт</li>
          <li>⏱ {a.time_limit_minutes} минут</li>
          <li>🎯 Тэнцэх оноо: {a.pass_score_pct}%</li>
          <li>🔁 Тэнцээгүй бол {a.cooldown_hours} цагийн дараа дахин</li>
        </ul>
        <p className="mt-3 text-xs text-muted">Олгогч: академи. Энэ нь Meta-гийн болон төрийн магадлан итгэмжлэгдсэн сертификат биш. Төлбөр нь шалгалт өгөх эрх бөгөөд тэнцэхийг баталгаажуулахгүй.</p>
      </Card>

      <div aria-live="polite">
        {s.status === "locked_premium" && (
          <Card>
            <h2 className="text-lg font-extrabold">Premium эрх шаардлагатай</h2>
            <p className="mt-1 text-muted">Эцсийн шалгалт болон 4–5-р түвшин Premium эрхээр нээгдэнэ.</p>
            <ButtonLink href={`/${locale}/unlock/${course}`} className="mt-4">Нөхцөл ба үнэ харах</ButtonLink>
          </Card>
        )}
        {s.status === "locked_lessons" && (
          <Card>
            <h2 className="text-lg font-extrabold">Эхлээд бүх түвшнээ дуусгана уу</h2>
            <p className="mt-1 text-muted">{s.lessonsCompleted}/{s.lessonsTotal} түвшин дууссан.</p>
            <ButtonLink href={`/${locale}/learn/${course}`} className="mt-4">Зам руу</ButtonLink>
          </Card>
        )}
        {s.status === "cooldown" && (
          <Alert tone="warning" title={`Өмнөх оролдлого: ${s.lastAttempt?.score_pct ?? 0}% — тэнцээгүй`}>
            Дахин өгөх боломжтой хугацаа: {formatDateTime(s.cooldownUntil)}. Энэ хооронд давтлагаа хийгээрэй.
          </Alert>
        )}
        {(s.status === "eligible" || s.status === "in_progress") && (
          <Card>
            {s.lastAttempt?.passed === false && (
              <p className="mb-3 text-sm text-muted">Өмнөх оролдлого: {s.lastAttempt.score_pct}%.</p>
            )}
            <StartExamButton locale={locale} assessmentId={a.id} resume={s.status === "in_progress"} />
          </Card>
        )}
        {s.status === "passed" && s.credential && (
          <Alert tone="success" title="Баяр хүргэе! Та сертификат авсан.">
            <p>Дугаар {s.credential.credential_number} · {formatDate(s.credential.issued_at)}{s.credential.is_demo ? " · ДЕМО" : ""}</p>
            <ButtonLink href={`/${locale}/me/certificates`} className="mt-3">Миний сертификатууд</ButtonLink>
          </Alert>
        )}
      </div>
    </div>
  );
}
