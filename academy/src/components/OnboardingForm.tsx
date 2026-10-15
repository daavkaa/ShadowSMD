"use client";
import { useState } from "react";
import { Alert, Button, cx } from "@/components/ui";
import { postJson } from "@/lib/client/api";

const goals = [
  ["career", "Ажил мэргэжлээ ахиулах"],
  ["business", "Өөрийн бизнесээ сурталчлах"],
  ["agency", "Агентлаг / багийн ажилд"],
  ["student", "Оюутан, шинэ ур чадвар"],
  ["curious", "Зүгээр сонирхож байна"],
] as const;
const minutes = [5, 10, 15, 20, 30] as const;

export function OnboardingForm({ locale, defaultName }: { locale: string; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [goal, setGoal] = useState<string | null>(null);
  const [mins, setMins] = useState<number>(10);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await postJson("/api/onboarding", { displayName: name, goal, dailyMinutes: mins });
    if (r.ok) window.location.assign(`/${locale}/learn/smm-foundations`);
    else { setErr(r.message); setBusy(false); }
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div>
        <label htmlFor="name" className="text-sm font-bold">Сертификат дээр харагдах нэр</label>
        <input id="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border-2 border-line px-4 py-3" />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Таны зорилго</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {goals.map(([v, l]) => (
            <label key={v} className={cx("flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5", goal === v ? "border-primary bg-lavender-soft" : "border-line")}>
              <input type="radio" name="goal" value={v} checked={goal === v} onChange={() => setGoal(v)} className="accent-[var(--color-primary)]" /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Өдөрт хэдэн минут?</legend>
        <div className="flex flex-wrap gap-2">
          {minutes.map((m) => (
            <label key={m} className={cx("cursor-pointer rounded-xl border-2 px-4 py-2", mins === m ? "border-primary bg-lavender-soft" : "border-line")}>
              <input type="radio" name="mins" className="sr-only" checked={mins === m} onChange={() => setMins(m)} /> {m} мин
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Зөвхөн зөвлөмж — өдөр алгасвал торгууль байхгүй.</p>
      </fieldset>
      {err && <Alert tone="danger" role="alert">{err}</Alert>}
      <Button type="submit" disabled={busy || !goal || name.trim().length < 2} className="w-full" data-testid="onboarding-submit">Эхний хичээл рүү</Button>
    </form>
  );
}
