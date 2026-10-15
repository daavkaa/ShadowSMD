import { isUuidLike } from "@/lib/validation";
import "server-only";
import { withService, withUser, type Tx } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { randomId } from "@/lib/security/crypto";

/**
 * Issues a credential inside the exam-submission transaction. Callers must
 * have verified the pass. A credential is "demo" when the learner's only
 * covering entitlements are demo grants — the verifier shows that label.
 */
export async function issueCredentialTx(tx: Tx, p: { userId: string; courseId: string; attemptId: string; scorePct: number }) {
  const env = getEnv();
  const [prof] = await tx<{ display_name: string; email: string | null }[]>`
    select p.display_name, u.email from public.profiles p join auth.users u on u.id = p.id where p.id = ${p.userId}`;
  const [course] = await tx<{ title: string; library_tier: string }[]>`select title, library_tier from public.courses where id = ${p.courseId}`;
  if (!prof || !course) throw new AppError("not_found");
  const holder = (prof.display_name || prof.email?.split("@")[0] || "Суралцагч").slice(0, 80);
  const [{ real }] = (await tx<{ real: boolean }[]>`
    select exists (
      select 1 from public.entitlements e
      where e.subject_user_id = ${p.userId} and e.status = 'active' and not e.is_demo
        and e.valid_from <= now() and (e.valid_until is null or e.valid_until > now())
        and (e.scope_kind = 'library_pro' or (e.scope_kind = 'library_core' and ${course.library_tier} = 'core')
             or (e.scope_kind = 'course' and e.scope_course_id = ${p.courseId})
             or (e.scope_kind = 'bundle' and exists (select 1 from public.bundle_courses b where b.bundle_product_id = e.scope_bundle_product_id and b.course_id = ${p.courseId})))
    ) as real`) as unknown as [{ real: boolean }];
  const publicId = randomId(20);
  const [{ seq }] = (await tx<{ seq: string }[]>`select nextval('public.credential_number_seq')::text as seq`) as unknown as [{ seq: string }];
  const number = `SA-${new Date().getUTCFullYear()}-${seq.padStart(6, "0")}`;
  const [cred] = (await tx<{ id: string }[]>`
    insert into public.credentials (public_id, credential_number, user_id, course_id, assessment_attempt_id, holder_name, credential_title, score_pct, issuer_name, is_demo)
    values (${publicId}, ${number}, ${p.userId}, ${p.courseId}, ${p.attemptId}, ${holder}, ${course.title}, ${p.scorePct}, ${env.CREDENTIAL_ISSUER_NAME}, ${!real})
    returning id`) as unknown as [{ id: string }];
  await tx`insert into public.credential_events (credential_id, kind, actor_id) values (${cred.id}, 'issued', ${p.userId})`;
  return { id: cred.id, publicId, number };
}

export type MyCredential = {
  id: string;
  public_id: string;
  credential_number: string;
  credential_title: string;
  holder_name: string;
  score_pct: number;
  issued_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
  is_demo: boolean;
};

export async function listMyCredentials(userId: string): Promise<MyCredential[]> {
  return withUser(userId, (tx) => tx<MyCredential[]>`
    select id, public_id, credential_number, credential_title, holder_name, score_pct, issued_at, revoked_at, revoke_reason, is_demo
    from public.credentials order by issued_at desc`);
}

export async function getMyCredential(userId: string, id: string): Promise<(MyCredential & { issuer_name: string }) | null> {
  if (!isUuidLike(id)) return null;
  return withUser(userId, async (tx) => {
    const [c] = await tx<(MyCredential & { issuer_name: string })[]>`
      select id, public_id, credential_number, credential_title, holder_name, score_pct, issued_at, revoked_at, revoke_reason, is_demo, issuer_name
      from public.credentials where id = ${id}`;
    return c ?? null;
  });
}

export type Verification = {
  credential_number: string;
  credential_title: string;
  holder_name: string | null;
  issuer_name: string;
  issued_at: Date;
  expires_at: Date | null;
  status: "valid" | "revoked" | "expired";
  is_demo: boolean;
};

/** Public verification via the minimal security-definer read model (anon role). */
export async function verifyCredential(publicId: string): Promise<Verification | null> {
  if (!/^[A-Za-z0-9]{16,40}$/.test(publicId)) return null;
  return withUser(null, async (tx) => {
    const [v] = await tx<Verification[]>`select * from public.verify_credential(${publicId})`;
    return v ?? null;
  });
}

export async function revokeCredential(actorId: string, credentialId: string, reason: string) {
  if (reason.trim().length < 5) throw new AppError("invalid_input", "reason required");
  return withService(async (tx) => {
    const [staff] = await tx`select 1 from public.platform_roles where user_id = ${actorId} and role in ('admin', 'support')`;
    if (!staff) throw new AppError("forbidden");
    const r = await tx`update public.credentials set revoked_at = now(), revoke_reason = ${reason} where id = ${credentialId} and revoked_at is null returning id`;
    if (!r.length) throw new AppError("not_found");
    await tx`insert into public.credential_events (credential_id, kind, actor_id, reason) values (${credentialId}, 'revoked', ${actorId}, ${reason})`;
    await tx`insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata) values (${actorId}, 'credential.revoke', 'credential', ${credentialId}, ${tx.json({ reason })})`;
  });
}

export function verificationUrl(publicId: string) {
  return `${getEnv().APP_URL}/verify/${publicId}`;
}
