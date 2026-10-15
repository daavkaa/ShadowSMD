"use client";
import { useMemo, useState } from "react";
import { Alert, Button, cx } from "@/components/ui";

type Option = { id: string; label: string };
export type StepData = { id: string; kind: "text" | "single_choice" | "multi_choice" | "ordering" | "scenario" | "reflection"; content: Record<string, unknown> };
export type StepFeedback = { correct: boolean | null; explanation: string | null; correctAnswer: unknown | null; xpAwarded?: number };

type Props = {
  step: StepData;
  onSubmit: (answer: unknown) => Promise<StepFeedback | { error: string }>;
  onContinue: () => void;
  continueLabel?: string;
};

/** Renders one learning step, collects an answer, shows server feedback. Never decides correctness itself. */
export function StepView({ step, onSubmit, onContinue, continueLabel = "Үргэлжлүүлэх" }: Props) {
  const c = step.content as { title?: string; body?: string[]; tip?: string; prompt?: string; context?: string; placeholder?: string; options?: Option[]; items?: Option[] };
  const [single, setSingle] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [order, setOrder] = useState<Option[]>(() => c.items ?? []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<StepFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const labelOf = useMemo(() => new Map([...(c.options ?? []), ...(c.items ?? [])].map((o) => [o.id, o.label])), [c.options, c.items]);

  const answer = (): unknown => {
    switch (step.kind) {
      case "text": return { acknowledged: true };
      case "single_choice": case "scenario": return single ? { choice: single } : null;
      case "multi_choice": return multi.length ? { choices: multi } : null;
      case "ordering": return { order: order.map((o) => o.id) };
      case "reflection": return text.trim().length >= 10 ? { text } : null;
    }
  };

  async function submit() {
    const a = answer();
    if (!a) return;
    setBusy(true);
    setError(null);
    const r = await onSubmit(a);
    setBusy(false);
    if ("error" in r) setError(r.error);
    else {
      setFb(r);
      if (r.correct === null) onContinue(); // unscored steps advance immediately
    }
  }

  function retry() {
    setFb(null);
    setSingle(null);
    setMulti([]);
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };

  const locked = fb !== null && fb.correct !== false;
  const revealed = (fb?.correctAnswer ?? null) as { correct?: string | string[]; order?: string[] } | null;

  return (
    <div className="space-y-5">
      {step.kind === "text" && (
        <div className="space-y-3">
          <h2 className="text-xl font-extrabold">{c.title}</h2>
          {c.body?.map((p, i) => <p key={i} className="leading-relaxed">{p}</p>)}
          {c.tip && <Alert tone="primary" title="Зөвлөгөө">{c.tip}</Alert>}
        </div>
      )}

      {step.kind === "scenario" && c.context && (
        <div className="rounded-2xl border-l-4 border-lavender bg-lavender-soft p-4"><p className="text-sm font-bold text-primary-strong">Нөхцөл байдал</p><p className="mt-1">{c.context}</p></div>
      )}

      {(step.kind === "single_choice" || step.kind === "scenario") && (
        <fieldset disabled={locked || busy}>
          <legend className="mb-3 text-lg font-extrabold">{c.prompt}</legend>
          <div className="space-y-2">
            {c.options?.map((o) => (
              <label key={o.id} className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3", single === o.id ? "border-primary bg-lavender-soft" : "border-line bg-white")}>
                <input type="radio" name={`s-${step.id}`} value={o.id} checked={single === o.id} onChange={() => setSingle(o.id)} className="h-5 w-5 accent-[var(--color-primary)]" />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {step.kind === "multi_choice" && (
        <fieldset disabled={locked || busy}>
          <legend className="mb-3 text-lg font-extrabold">{c.prompt}</legend>
          <div className="space-y-2">
            {c.options?.map((o) => {
              const on = multi.includes(o.id);
              return (
                <label key={o.id} className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3", on ? "border-primary bg-lavender-soft" : "border-line bg-white")}>
                  <input type="checkbox" checked={on} onChange={() => setMulti(on ? multi.filter((x) => x !== o.id) : [...multi, o.id])} className="h-5 w-5 accent-[var(--color-primary)]" />
                  <span>{o.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {step.kind === "ordering" && (
        <div>
          <p className="mb-3 text-lg font-extrabold" id={`o-${step.id}`}>{c.prompt}</p>
          <ol className="space-y-2" aria-labelledby={`o-${step.id}`}>
            {order.map((o, i) => (
              <li key={o.id} className="flex items-center gap-2 rounded-2xl border-2 border-line bg-white px-3 py-2">
                <span className="w-6 text-center font-extrabold text-muted">{i + 1}</span>
                <span className="flex-1">{o.label}</span>
                <button type="button" disabled={locked || busy || i === 0} onClick={() => move(i, -1)} className="rounded-lg px-2 py-1 font-bold text-primary-strong disabled:opacity-30" aria-label={`«${o.label}»-г дээш`}>↑</button>
                <button type="button" disabled={locked || busy || i === order.length - 1} onClick={() => move(i, 1)} className="rounded-lg px-2 py-1 font-bold text-primary-strong disabled:opacity-30" aria-label={`«${o.label}»-г доош`}>↓</button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {step.kind === "reflection" && (
        <div>
          <label htmlFor={`r-${step.id}`} className="mb-2 block text-lg font-extrabold">{c.prompt}</label>
          <textarea id={`r-${step.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} placeholder={c.placeholder}
            className="w-full rounded-2xl border-2 border-line p-3 focus:border-primary" />
          <p className="mt-1 text-xs text-muted">Хамгийн багадаа 10 тэмдэгт. Энэ хариулт оноогүй — зөвхөн өөрт тань зориулсан тэмдэглэл.</p>
        </div>
      )}

      <div aria-live="polite">
        {error && <Alert tone="danger" role="alert">{error}</Alert>}
        {fb && fb.correct === true && (
          <Alert tone="success" title={`Зөв! ${fb.xpAwarded ? `+${fb.xpAwarded} XP` : ""}`}>{fb.explanation}</Alert>
        )}
        {fb && fb.correct === false && (
          <Alert tone="danger" title="Буруу байна — дахин оролдоод үз">
            {revealed ? (
              <>
                <p>Зөв хариулт: {revealed.order ? revealed.order.map((id) => labelOf.get(id)).join(" → ") : [revealed.correct].flat().map((id) => labelOf.get(id as string)).join(", ")}</p>
                <p className="mt-1">{fb.explanation}</p>
              </>
            ) : (
              <p>Дахин бодоод үзээрэй. Хоёр дахь оролдлогын дараа тайлбар харагдана.</p>
            )}
          </Alert>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {!fb && (
          <Button onClick={() => void submit()} disabled={busy || answer() === null} data-testid="step-submit">
            {step.kind === "text" ? "Ойлголоо" : step.kind === "reflection" ? "Хадгалах" : "Шалгах"}
          </Button>
        )}
        {fb && fb.correct === false && <Button onClick={retry} variant="secondary" data-testid="step-retry">Дахин оролдох</Button>}
        {fb && fb.correct === true && <Button onClick={onContinue} data-testid="step-continue">{continueLabel}</Button>}
      </div>
    </div>
  );
}
