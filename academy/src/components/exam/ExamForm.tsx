"use client";
import { useEffect, useState } from "react";
import { Alert, Button, ButtonLink, Card, cx } from "@/components/ui";
import { postJson } from "@/lib/client/api";

type Q = { id: string; kind: "single_choice" | "multi_choice"; prompt: string; options: { id: string; label: string }[] };
type Attempt = { id: string; assessment_title: string; course_slug: string; expires_at: string; pass_score_pct: number; questions: Q[] };
type Result = { scorePct: number; passed: boolean; passScorePct: number; correct: number; total: number; byTopic: { topic: string; correct: number; total: number }[]; credentialPublicId: string | null };

const topicNames: Record<string, string> = { basics: "Суурь ойлголт", page: "Page тохиргоо", boost: "Boost", ads: "Ads Manager", analytics: "Аналитик", ethics: "Ёс зүй" };

export function ExamForm({ locale, attempt }: { locale: string; attempt: Attempt }) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [left, setLeft] = useState(() => Math.max(0, new Date(attempt.expires_at).getTime() - Date.now()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, new Date(attempt.expires_at).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [attempt.expires_at]);

  const answered = attempt.questions.filter((q) => (Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).length : answers[q.id])).length;

  async function submit() {
    if (answered < attempt.questions.length && !confirm(`${attempt.questions.length - answered} асуулт хариулаагүй байна. Илгээх үү?`)) return;
    setBusy(true);
    setErr(null);
    const payload = Object.fromEntries(
      Object.entries(answers).map(([id, v]) => [id, Array.isArray(v) ? { choices: v } : { choice: v }]),
    );
    const r = await postJson<Result>(`/api/assessments/attempts/${attempt.id}/submit`, { answers: payload });
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      window.scrollTo({ top: 0 });
    } else setErr(r.message);
  }

  if (result) {
    return (
      <Card className="mx-auto max-w-2xl" aria-live="polite">
        <h1 className="text-2xl font-extrabold" data-testid="exam-result">{result.passed ? "Тэнцлээ!" : "Энэ удаад тэнцсэнгүй"}</h1>
        <p className="mt-2 text-lg">Оноо: <strong>{result.scorePct}%</strong> ({result.correct}/{result.total}) · Тэнцэх оноо {result.passScorePct}%</p>
        <h2 className="mt-5 font-extrabold">Сэдвээр</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {result.byTopic.map((t) => <li key={t.topic}>{topicNames[t.topic] ?? t.topic}: {t.correct}/{t.total}</li>)}
        </ul>
        <p className="mt-3 text-xs text-muted">Асуултын санг хамгаалах үүднээс асуулт тус бүрийн зөв хариултыг харуулахгүй.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {result.passed ? (
            <>
              <ButtonLink href={`/${locale}/me/certificates`} data-testid="view-certificates">Сертификат харах</ButtonLink>
              {result.credentialPublicId && <ButtonLink href={`/verify/${result.credentialPublicId}`} variant="secondary">Нийтийн баталгаажуулалт</ButtonLink>}
            </>
          ) : (
            <ButtonLink href={`/${locale}/review`}>Давтлага хийх</ButtonLink>
          )}
        </div>
      </Card>
    );
  }

  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between bg-canvas/95 px-4 py-3 backdrop-blur">
        <p className="font-extrabold">{answered}/{attempt.questions.length} хариулсан</p>
        <p className={cx("font-mono font-bold", left < 5 * 60000 ? "text-danger" : "text-muted")} role="timer" aria-label="Үлдсэн хугацаа">
          {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </p>
      </div>
      <h1 className="mb-4 text-xl font-extrabold">{attempt.assessment_title}</h1>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
        {attempt.questions.map((q, i) => (
          <Card key={q.id}>
            <fieldset>
              <legend className="mb-3 font-extrabold">{i + 1}. {q.prompt}{q.kind === "multi_choice" && <span className="ml-1 text-sm font-normal text-muted">(бүгдийг сонго)</span>}</legend>
              <div className="space-y-2">
                {q.options.map((o) => {
                  const multi = q.kind === "multi_choice";
                  const cur = answers[q.id];
                  const on = multi ? ((cur as string[] | undefined) ?? []).includes(o.id) : cur === o.id;
                  return (
                    <label key={o.id} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2.5", on ? "border-primary bg-lavender-soft" : "border-line")}>
                      <input
                        type={multi ? "checkbox" : "radio"}
                        name={q.id}
                        checked={on}
                        onChange={() =>
                          setAnswers((a) => {
                            if (!multi) return { ...a, [q.id]: o.id };
                            const list = (a[q.id] as string[] | undefined) ?? [];
                            return { ...a, [q.id]: list.includes(o.id) ? list.filter((x) => x !== o.id) : [...list, o.id] };
                          })
                        }
                        className="h-5 w-5 accent-[var(--color-primary)]"
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Card>
        ))}
        {err && <Alert tone="danger" role="alert">{err}</Alert>}
        <Button type="submit" disabled={busy} className="w-full" data-testid="submit-exam">Шалгалтаа илгээх</Button>
      </form>
    </div>
  );
}
