"use client";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { postJson } from "@/lib/client/api";

export function StartExamButton({ locale, assessmentId, resume }: { locale: string; assessmentId: string; resume: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    const r = await postJson<{ attemptId: string }>(`/api/assessments/${assessmentId}/start`);
    if (r.ok) window.location.assign(`/${locale}/certification/attempt/${r.data.attemptId}`);
    else {
      setErr(r.message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <Button onClick={() => void start()} disabled={busy} className="w-full sm:w-auto" data-testid="start-exam">
        {resume ? "Эхэлсэн шалгалтаа үргэлжлүүлэх" : "Шалгалт эхлүүлэх"}
      </Button>
      {err && <Alert tone="danger" role="alert">{err}</Alert>}
    </div>
  );
}
