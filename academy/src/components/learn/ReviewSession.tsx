"use client";
import { useState } from "react";
import { ButtonLink, Card } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { StepView, type StepData, type StepFeedback } from "./StepView";

type Item = StepData & { lesson_title: string; due: string };

export function ReviewSession({ items, locale }: { items: Item[]; locale: string }) {
  const [i, setI] = useState(0);
  const item = items[i];
  if (!item) {
    return (
      <Card className="text-center">
        <p className="text-lg font-extrabold">Өнөөдрийн давтлага дууслаа!</p>
        <ButtonLink href={`/${locale}/learn/smm-foundations`} className="mt-4">Суралцах зам руу</ButtonLink>
      </Card>
    );
  }
  return (
    <Card>
      <p className="mb-3 text-sm font-bold text-muted">{i + 1}/{items.length} · {item.lesson_title}</p>
      <StepView
        key={item.id}
        step={item}
        continueLabel={i + 1 < items.length ? "Дараагийнх" : "Дуусгах"}
        onSubmit={async (answer) => {
          const r = await postJson<StepFeedback>(`/api/reviews/${item.id}`, { answer });
          return r.ok ? r.data : { error: r.message };
        }}
        onContinue={() => setI((x) => x + 1)}
      />
      <p className="mt-4 text-xs text-muted">Буруу хариулбал маргааш дахин гарна; зөв бол дараагийн давтлагын хугацаа уртасна.</p>
    </Card>
  );
}
