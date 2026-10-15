"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, Button, ButtonLink, Card } from "@/components/ui";
import { SparkGuide } from "@/components/ui/Illustrations";
import { postJson } from "@/lib/client/api";
import { StepView, type StepData, type StepFeedback } from "./StepView";

type Props = {
  locale: string;
  courseSlug: string;
  lesson: { id: string; title: string; sort_order: number };
  steps: (StepData & { sort_order: number })[];
  answered: Record<string, { correct: boolean | null; attempts: number }>;
};

type Completion = { scorePct: number; xpAwarded: number; streak: { current_days: number }; nextLessonId: string | null };

const isDone = (s: StepData, a?: { correct: boolean | null; attempts: number }) =>
  !!a && (s.kind === "text" || s.kind === "reflection" ? a.attempts > 0 : a.correct === true);

export function LessonPlayer({ locale, courseSlug, lesson, steps, answered }: Props) {
  const firstOpen = steps.findIndex((s) => !isDone(s, answered[s.id]));
  const [index, setIndex] = useState(firstOpen === -1 ? steps.length : firstOpen);
  const [done, setDone] = useState<Completion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mapHref = `/${locale}/learn/${courseSlug}`;

  async function submit(stepId: string, answer: unknown): Promise<StepFeedback | { error: string }> {
    const r = await postJson<StepFeedback>(`/api/steps/${stepId}/submit`, { answer });
    return r.ok ? r.data : { error: r.message };
  }

  async function complete() {
    setBusy(true);
    setError(null);
    const r = await postJson<Completion>(`/api/lessons/${lesson.id}/complete`);
    setBusy(false);
    if (r.ok) setDone(r.data);
    else setError(r.message);
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-lg text-center" aria-live="polite">
        <div className="flex justify-center"><SparkGuide size={88} /></div>
        <h2 className="mt-3 text-2xl font-extrabold">Түвшин {lesson.sort_order} дууслаа!</h2>
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <div><dt className="text-xs font-bold text-muted">Эхний оролдлогын оноо</dt><dd className="text-xl font-extrabold">{done.scorePct}%</dd></div>
          <div><dt className="text-xs font-bold text-muted">XP</dt><dd className="text-xl font-extrabold">+{done.xpAwarded}</dd></div>
          <div><dt className="text-xs font-bold text-muted">Цуваа</dt><dd className="text-xl font-extrabold">{done.streak.current_days} өдөр</dd></div>
        </dl>
        <div className="mt-6 flex flex-col gap-3">
          {done.nextLessonId && <ButtonLink href={`/${locale}/lessons/${done.nextLessonId}`} data-testid="next-lesson">Дараагийн түвшин</ButtonLink>}
          <ButtonLink href={mapHref} variant="secondary" data-testid="back-to-map">Зам руу буцах</ButtonLink>
        </div>
      </Card>
    );
  }

  const step = steps[index];
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-4">
        <Link href={mapHref} className="font-bold text-muted hover:text-ink" aria-label="Хичээлээс гарах">✕</Link>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Хичээлийн явц" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={Math.min(index, steps.length)}>
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(Math.min(index, steps.length) / steps.length) * 100}%` }} />
        </div>
        <span className="text-sm font-bold text-muted">{Math.min(index + 1, steps.length)}/{steps.length}</span>
      </div>
      <p className="mb-2 text-sm font-bold text-muted">Түвшин {lesson.sort_order} · {lesson.title}</p>
      <Card>
        {step ? (
          <StepView key={step.id} step={step} onSubmit={(a) => submit(step.id, a)} onContinue={() => setIndex((i) => i + 1)} />
        ) : (
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-extrabold">Бүх алхмыг дуусгалаа</h2>
            <p className="text-muted">Түвшнээ хадгалж, XP-ээ аваарай.</p>
            {error && <Alert tone="danger" role="alert">{error}</Alert>}
            <Button onClick={() => void complete()} disabled={busy} data-testid="lesson-complete">Түвшнийг дуусгах</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
