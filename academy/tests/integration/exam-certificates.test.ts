import { beforeEach, describe, expect, it } from "vitest";
import { getAttemptForUser, getCertificationState, startAttempt, submitAttempt } from "@/features/assessments/service";
import { verifyCredential } from "@/features/credentials/service";
import { renderCertificatePdf } from "@/features/credentials/pdf";
import { getLessonForPlayer, getCourseMap } from "@/features/learning/service";
import { resetRateLimits } from "@/lib/security/rate-limit";
import { admin, asUser, createUser, ids } from "../support/db";
import { buyWithDemo, finishAllLessons } from "../support/flows";

beforeEach(() => resetRateLimits());

async function answersFor(attemptId: string, correctCount: number) {
  const [att] = await admin<{ question_ids: string[] }[]>`select question_ids from public.assessment_attempts where id = ${attemptId}`;
  const keys = await admin<{ id: string; kind: string; body: { options: { id: string }[] }; correct: { correct: string | string[] } }[]>`
    select q.id, q.kind, q.body, k.correct from public.assessment_questions q join public.assessment_question_keys k on k.question_id = q.id where q.id = any(${att!.question_ids}::uuid[])`;
  const out: Record<string, unknown> = {};
  keys.forEach((k, i) => {
    const right = i < correctCount;
    if (k.kind === "multi_choice") {
      const c = k.correct.correct as string[];
      out[k.id] = { choices: right ? c : [k.body.options.find((o) => !c.includes(o.id))!.id] };
    } else {
      out[k.id] = { choice: right ? k.correct.correct : k.body.options.find((o) => o.id !== k.correct.correct)!.id };
    }
  });
  return out;
}

describe("final exam gate", () => {
  it("requires premium access and all levels completed", async () => {
    const u = await createUser();
    const exam = await ids.assessment();
    await expect(startAttempt(u.id, exam)).rejects.toMatchObject({ code: "premium_required" });
    expect((await getCertificationState(u.id, "smm-foundations"))!.status).toBe("locked_premium");
    await buyWithDemo(u.id);
    await expect(startAttempt(u.id, exam)).rejects.toMatchObject({ code: "lessons_incomplete" });
    expect((await getCertificationState(u.id, "smm-foundations"))!.status).toBe("locked_lessons");
  });

  it("purchase alone never issues a certificate; failing does not issue; cooldown applies", async () => {
    const u = await createUser("Шалгуулагч");
    const exam = await ids.assessment();
    await buyWithDemo(u.id);
    await finishAllLessons(u.id);
    expect(await admin`select * from public.credentials where user_id = ${u.id}`).toHaveLength(0);
    const { attemptId } = await startAttempt(u.id, exam);
    const view = (await getAttemptForUser(u.id, attemptId))!;
    expect(view.questions).toHaveLength(20);
    expect(JSON.stringify(view)).not.toMatch(/"correct"/); // keys never sent
    const other = await createUser();
    expect(await getAttemptForUser(other.id, attemptId)).toBeNull();
    await expect(submitAttempt(other.id, attemptId, { answers: {} })).rejects.toMatchObject({ code: "not_found" });

    const res = await submitAttempt(u.id, attemptId, { answers: await answersFor(attemptId, 15) }); // 75%
    expect(res).toMatchObject({ scorePct: 75, passed: false, credentialPublicId: null });
    expect(await admin`select * from public.credentials where user_id = ${u.id}`).toHaveLength(0);
    await expect(submitAttempt(u.id, attemptId, { answers: {} })).rejects.toMatchObject({ code: "attempt_closed" });
    await expect(startAttempt(u.id, exam)).rejects.toMatchObject({ code: "cooldown_active" });
    expect((await getCertificationState(u.id, "smm-foundations"))!.status).toBe("cooldown");
  });

  it("passing at exactly 80% issues one verifiable credential (labelled demo when access was demo)", async () => {
    const u = await createUser("Тэнцсэн Суралцагч");
    const exam = await ids.assessment();
    await buyWithDemo(u.id);
    await finishAllLessons(u.id);
    const { attemptId } = await startAttempt(u.id, exam);
    const again = await startAttempt(u.id, exam);
    expect(again).toEqual({ attemptId, resumed: true });
    const res = await submitAttempt(u.id, attemptId, { answers: await answersFor(attemptId, 16) });
    expect(res).toMatchObject({ scorePct: 80, passed: true });
    expect(res.credentialPublicId).toMatch(/^[A-Za-z0-9]{20}$/);

    const v = (await verifyCredential(res.credentialPublicId!))!;
    expect(v).toMatchObject({ status: "valid", holder_name: "Тэнцсэн Суралцагч", is_demo: true });
    expect(Object.keys(v)).not.toContain("score_pct"); // minimal public read-model
    expect(await verifyCredential("AAAAAAAAAAAAAAAAAAAA")).toBeNull();
    await expect(startAttempt(u.id, exam)).rejects.toMatchObject({ code: "already_certified" });
    expect((await getCourseMap(u.id, "smm-foundations"))!.certified).toBe(true);

    // Learner can hide their name on the public verifier.
    await asUser(u.id, (tx) => tx`update public.profiles set show_name_on_credentials = false where id = ${u.id}`);
    expect((await verifyCredential(res.credentialPublicId!))!.holder_name).toBeNull();

    const pdf = await renderCertificatePdf({ holderName: "Тэнцсэн Суралцагч", title: "Тест", credentialNumber: "SA-2026-000001", issuedAt: new Date(), issuerName: "Skills Academy", verifyUrl: "http://localhost:3000/verify/x", isDemo: true });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("anon cannot read credentials table directly, only the verifier function", async () => {
    await expect(asUser(null, (tx) => tx`select * from public.credentials`)).rejects.toThrow(/permission denied/);
  });
});

describe("entitlement expiry", () => {
  it("expired access locks premium activities but keeps history and certificates", async () => {
    const u = await createUser("Хугацаа дууссан");
    const exam = await ids.assessment();
    await buyWithDemo(u.id);
    await finishAllLessons(u.id);
    const { attemptId } = await startAttempt(u.id, exam);
    const res = await submitAttempt(u.id, attemptId, { answers: await answersFor(attemptId, 20) });
    expect(res.passed).toBe(true);

    await admin`update public.entitlements set valid_from = now() - interval '40 days', valid_until = now() - interval '1 day' where subject_user_id = ${u.id}`;
    const premium = (await ids.lessons()).find((l) => l.access_tier === "premium")!;
    await expect(getLessonForPlayer(u.id, premium.id)).rejects.toMatchObject({ code: "premium_required" });
    const progress = await admin`select * from public.lesson_progress where user_id = ${u.id} and status = 'completed'`;
    expect(progress.length).toBe(5);
    expect((await verifyCredential(res.credentialPublicId!))!.status).toBe("valid");
    const map = (await getCourseMap(u.id, "smm-foundations"))!;
    expect(map.nodes.filter((n) => n.state === "completed")).toHaveLength(6);
  });
});
