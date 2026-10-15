"use client";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { postJson } from "@/lib/client/api";

type Step = { id: string; kind: string; sort_order: number; points: number; content: unknown; answer: unknown; explanation: string };

export function StepEditor({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(JSON.stringify(step.content, null, 2));
  const [answer, setAnswer] = useState(step.answer ? JSON.stringify(step.answer, null, 2) : "");
  const [explanation, setExplanation] = useState(step.explanation);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function save() {
    setMsg(null);
    let c: unknown, a: unknown;
    try {
      c = JSON.parse(content);
      a = answer.trim() ? JSON.parse(answer) : undefined;
    } catch {
      return setMsg({ tone: "danger", text: "JSON буруу байна." });
    }
    const r = await postJson(`/api/admin/steps/${step.id}`, { content: c, answer: a, explanation });
    setMsg(r.ok ? { tone: "success", text: "Хадгаллаа." } : { tone: "danger", text: `${r.message} ${JSON.stringify(r.details?.issues ?? "")}` });
  }

  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm" aria-expanded={open}>
        <span><strong>#{step.sort_order}</strong> · {step.kind} · {step.points} оноо</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-3">
          <label className="block text-xs font-bold" htmlFor={`c-${step.id}`}>Агуулга (JSON)</label>
          <textarea id={`c-${step.id}`} value={content} onChange={(e) => setContent(e.target.value)} rows={8} className="w-full rounded-lg border border-line p-2 font-mono text-xs" />
          {step.answer !== null && (
            <>
              <label className="block text-xs font-bold" htmlFor={`a-${step.id}`}>Зөв хариулт (нууц, JSON)</label>
              <textarea id={`a-${step.id}`} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} className="w-full rounded-lg border border-line p-2 font-mono text-xs" />
              <label className="block text-xs font-bold" htmlFor={`e-${step.id}`}>Тайлбар</label>
              <textarea id={`e-${step.id}`} value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className="w-full rounded-lg border border-line p-2 text-sm" />
            </>
          )}
          <Button type="button" onClick={() => void save()} className="min-h-10 px-4 py-2 text-sm">Хадгалах</Button>
          {msg && <Alert tone={msg.tone} role="status">{msg.text}</Alert>}
        </div>
      )}
    </div>
  );
}

export function PublishButton({ courseId }: { courseId: string }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => {
      e.preventDefault();
      const r = await postJson<{ version: number }>(`/api/admin/courses/${courseId}/publish`, { note });
      setMsg(r.ok ? `Хувилбар v${r.data.version} нийтлэгдлээ (хянасан огноо шинэчлэгдсэн).` : r.message);
    }}>
      <label htmlFor="pub-note" className="sr-only">Өөрчлөлтийн тэмдэглэл</label>
      <input id="pub-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Өөрчлөлтийн тэмдэглэл" required minLength={3} className="flex-1 rounded-xl border-2 border-line px-3 py-2" />
      <Button type="submit" variant="secondary">Шинэ хувилбар нийтлэх</Button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  );
}
