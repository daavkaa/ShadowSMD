import { z } from "zod";

export type StepKind = "text" | "single_choice" | "multi_choice" | "ordering" | "scenario" | "reflection";
export const SCORED_KINDS: ReadonlySet<StepKind> = new Set(["single_choice", "multi_choice", "ordering", "scenario"]);

const optionId = z.string().min(1).max(16);

export const answerSchemas = {
  text: z.object({ acknowledged: z.literal(true) }),
  single_choice: z.object({ choice: optionId }),
  scenario: z.object({ choice: optionId }),
  multi_choice: z.object({ choices: z.array(optionId).min(1).max(12) }),
  ordering: z.object({ order: z.array(optionId).min(2).max(12) }),
  reflection: z.object({ text: z.string().trim().min(10).max(2000) }),
} satisfies Record<StepKind, z.ZodTypeAny>;

export const keySchemas = {
  single_choice: z.object({ correct: optionId }),
  scenario: z.object({ correct: optionId }),
  multi_choice: z.object({ correct: z.array(optionId).min(1) }),
  ordering: z.object({ order: z.array(optionId).min(2) }),
};

export type ScoreResult = {
  /** null for unscored steps (text, reflection) */
  correct: boolean | null;
  /** The answer as validated and normalized (safe to store). */
  normalized: unknown;
};

function sameSet(a: readonly string[], b: readonly string[]) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== a.length) return false; // duplicate choices are invalid answers
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/** Server-side authoritative scoring. Throws ZodError on malformed answers. */
export function scoreStep(kind: StepKind, key: unknown, rawAnswer: unknown): ScoreResult {
  switch (kind) {
    case "text":
      return { correct: null, normalized: answerSchemas.text.parse(rawAnswer) };
    case "reflection":
      return { correct: null, normalized: answerSchemas.reflection.parse(rawAnswer) };
    case "single_choice":
    case "scenario": {
      const a = answerSchemas[kind].parse(rawAnswer);
      const k = keySchemas[kind].parse(key);
      return { correct: a.choice === k.correct, normalized: a };
    }
    case "multi_choice": {
      const a = answerSchemas.multi_choice.parse(rawAnswer);
      const k = keySchemas.multi_choice.parse(key);
      return { correct: sameSet(a.choices, k.correct), normalized: a };
    }
    case "ordering": {
      const a = answerSchemas.ordering.parse(rawAnswer);
      const k = keySchemas.ordering.parse(key);
      return { correct: a.order.length === k.order.length && a.order.every((x, i) => x === k.order[i]), normalized: a };
    }
  }
}

/** XP for a correct answer: full points on first try, half after retries, never negative. */
export function xpForStep(points: number, attemptNo: number, correct: boolean | null): number {
  if (!correct || points <= 0) return 0;
  return attemptNo === 1 ? points : Math.floor(points / 2);
}

export const LESSON_COMPLETE_XP = 20;
export const EXAM_PASS_XP = 100;
export const REVIEW_XP = 5;

/** Exam score: floor of percentage so that 79.9% never rounds up to a pass at 80. */
export function examScorePct(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((correct * 100) / total);
}
