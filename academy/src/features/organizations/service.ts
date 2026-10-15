import "server-only";
import { z } from "zod";
import { withService, withUser, type Tx } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { randomToken, sha256Hex } from "@/lib/security/crypto";

export type OrgMemberRow = {
  user_id: string;
  display_name: string;
  role: "owner" | "manager" | "member";
  has_active_seat: boolean;
  lessons_completed: number;
  final_passed: boolean;
  credential_number: string | null;
};

export type OrgDashboard = {
  org: { id: string; slug: string; name: string; pilot_ends_at: Date | null };
  seatPools: { id: string; purchased_seats: number; used_seats: number; active_from: Date; active_until: Date }[];
  members: OrgMemberRow[];
  assignments: { id: string; user_id: string; seat_pool_id: string }[];
  invitations: { id: string; email: string; role: string; expires_at: Date; accepted_at: Date | null }[];
  assignedCourses: { course_id: string; title: string; slug: string; due_date: string | null; lesson_count: number }[];
};

/** All reads go through RLS + the manager-only report function. */
export async function getOrgDashboard(userId: string, slug: string): Promise<OrgDashboard> {
  return withUser(userId, async (tx) => {
    const [org] = await tx<OrgDashboard["org"][]>`select id, slug, name, pilot_ends_at from public.organizations where slug = ${slug}`;
    if (!org) throw new AppError("not_found"); // non-members cannot even see the org exists
    const [{ ok }] = (await tx<{ ok: boolean }[]>`select public.is_org_manager(${org.id}) as ok`) as unknown as [{ ok: boolean }];
    if (!ok) throw new AppError("forbidden");
    const seatPools = await tx<OrgDashboard["seatPools"]>`
      select p.id, p.purchased_seats, p.active_from, p.active_until,
             (select count(*)::int from public.seat_assignments s where s.seat_pool_id = p.id and s.revoked_at is null) as used_seats
      from public.seat_pools p where p.org_id = ${org.id} order by p.active_until desc`;
    const members = await tx<OrgMemberRow[]>`select * from public.org_member_progress(${org.id})`;
    const assignments = await tx<OrgDashboard["assignments"]>`
      select id, user_id, seat_pool_id from public.seat_assignments where org_id = ${org.id} and revoked_at is null`;
    const invitations = await tx<OrgDashboard["invitations"]>`
      select id, email, role, expires_at, accepted_at from public.organization_invitations where org_id = ${org.id} order by created_at desc limit 50`;
    const assignedCourses = await tx<OrgDashboard["assignedCourses"]>`
      select ap.course_id, c.title, c.slug, to_char(ap.due_date, 'YYYY-MM-DD') as due_date,
             (select count(*)::int from public.lessons l where l.course_id = c.id and l.status = 'published') as lesson_count
      from public.organization_assigned_paths ap join public.courses c on c.id = ap.course_id where ap.org_id = ${org.id}`;
    return { org, seatPools, members, assignments, invitations, assignedCourses };
  });
}

export async function listMyOrganizations(userId: string) {
  return withUser(userId, (tx) => tx<{ id: string; slug: string; name: string; role: string }[]>`
    select o.id, o.slug, o.name, m.role from public.organizations o
    join public.organization_memberships m on m.org_id = o.id and m.user_id = ${userId} and m.status = 'active'
    order by o.name`);
}

async function assertManager(tx: Tx, actorId: string, orgId: string) {
  const [m] = await tx`select 1 from public.organization_memberships where org_id = ${orgId} and user_id = ${actorId} and status = 'active' and role in ('owner', 'manager')`;
  if (!m) throw new AppError("forbidden");
}

async function audit(tx: Tx, actorId: string, orgId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await tx`insert into public.admin_audit_log (actor_id, organization_id, action, entity_type, entity_id, metadata)
           values (${actorId}, ${orgId}, ${action}, ${entityType}, ${entityId}, ${tx.json(metadata as never)})`;
}

export async function assignSeat(actorId: string, orgId: string, targetUserId: string) {
  return withService(async (tx) => {
    await assertManager(tx, actorId, orgId);
    const [member] = await tx`select 1 from public.organization_memberships where org_id = ${orgId} and user_id = ${targetUserId} and status = 'active'`;
    if (!member) throw new AppError("not_org_member"); // seats only for this tenant's own members
    const pools = await tx<{ id: string; purchased_seats: number; active_until: Date; product_scope: string }[]>`
      select p.id, p.purchased_seats, p.active_until, pr.scope_kind as product_scope
      from public.seat_pools p join public.products pr on pr.id = p.product_id
      where p.org_id = ${orgId} and p.active_from <= now() and p.active_until > now() order by p.active_until desc for update of p`;
    for (const pool of pools) {
      const [existing] = await tx<{ id: string }[]>`select id from public.seat_assignments where seat_pool_id = ${pool.id} and user_id = ${targetUserId} and revoked_at is null`;
      if (existing) return { assignmentId: existing.id, alreadyAssigned: true };
      const [{ used }] = (await tx<{ used: number }[]>`select count(*)::int as used from public.seat_assignments where seat_pool_id = ${pool.id} and revoked_at is null`) as unknown as [{ used: number }];
      if (used >= pool.purchased_seats) continue;
      const [a] = (await tx<{ id: string }[]>`
        insert into public.seat_assignments (seat_pool_id, org_id, user_id, assigned_by) values (${pool.id}, ${orgId}, ${targetUserId}, ${actorId}) returning id`) as unknown as [{ id: string }];
      await tx`insert into public.entitlements (subject_user_id, organization_id, scope_kind, source_kind, source_id, valid_until)
               values (${targetUserId}, ${orgId}, ${pool.product_scope}, 'seat', ${a.id}, ${pool.active_until})`;
      await audit(tx, actorId, orgId, "seat.assign", "seat_assignment", a.id, { user_id: targetUserId });
      return { assignmentId: a.id, alreadyAssigned: false };
    }
    throw new AppError("no_seats_available");
  });
}

/** Revoking a seat ends org-provided access only; the learner keeps their progress and credentials. */
export async function revokeSeat(actorId: string, orgId: string, assignmentId: string) {
  return withService(async (tx) => {
    await assertManager(tx, actorId, orgId);
    const r = await tx<{ user_id: string }[]>`
      update public.seat_assignments set revoked_at = now(), revoked_by = ${actorId}
      where id = ${assignmentId} and org_id = ${orgId} and revoked_at is null returning user_id`;
    if (!r.length) throw new AppError("not_found");
    await tx`update public.entitlements set status = 'revoked', revoked_reason = 'seat_revoked' where source_kind = 'seat' and source_id = ${assignmentId}`;
    await audit(tx, actorId, orgId, "seat.revoke", "seat_assignment", assignmentId, { user_id: r[0]!.user_id });
    return { ok: true };
  });
}

export const inviteInput = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.enum(["member", "manager"]).default("member") });

export async function inviteMember(actorId: string, orgId: string, input: z.input<typeof inviteInput>) {
  const { email, role } = inviteInput.parse(input);
  return withService(async (tx) => {
    await assertManager(tx, actorId, orgId);
    const token = randomToken(32);
    const [inv] = (await tx<{ id: string }[]>`
      insert into public.organization_invitations (org_id, email, role, token_hash, created_by, expires_at)
      values (${orgId}, ${email}, ${role}, ${sha256Hex(token)}, ${actorId}, now() + interval '14 days') returning id`) as unknown as [{ id: string }];
    await audit(tx, actorId, orgId, "invitation.create", "invitation", inv.id, { role });
    // No email provider configured in MVP: the link is shown to the manager once (only the hash is stored).
    await tx`insert into public.outbox_events (topic, payload) values ('org.invitation', ${tx.json({ invitation_id: inv.id })})`;
    return { invitationId: inv.id, link: `${getEnv().APP_URL}/mn/invite/${token}` };
  });
}

export async function acceptInvitation(userId: string, userEmail: string | null, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new AppError("invitation_invalid");
  return withService(async (tx) => {
    const [inv] = await tx<{ id: string; org_id: string; email: string; role: string; expires_at: Date; accepted_at: Date | null; slug: string }[]>`
      select i.id, i.org_id, i.email, i.role, i.expires_at, i.accepted_at, o.slug from public.organization_invitations i
      join public.organizations o on o.id = i.org_id where i.token_hash = ${sha256Hex(token)} for update of i`;
    if (!inv || inv.accepted_at || inv.expires_at <= new Date()) throw new AppError("invitation_invalid");
    if (!userEmail || userEmail.toLowerCase() !== inv.email) throw new AppError("invitation_email_mismatch");
    await tx`insert into public.organization_memberships (org_id, user_id, role) values (${inv.org_id}, ${userId}, ${inv.role})
             on conflict (org_id, user_id) do update set status = 'active', role = excluded.role, removed_at = null`;
    await tx`update public.organization_invitations set accepted_at = now(), accepted_by = ${userId} where id = ${inv.id}`;
    await tx`insert into public.consents (user_id, consent_type, version) values (${userId}, 'org_progress_sharing', 'v1')`;
    await audit(tx, userId, inv.org_id, "invitation.accept", "invitation", inv.id);
    return { orgId: inv.org_id, orgSlug: inv.slug };
  });
}

export async function removeMember(actorId: string, orgId: string, targetUserId: string) {
  return withService(async (tx) => {
    await assertManager(tx, actorId, orgId);
    if (actorId === targetUserId) throw new AppError("invalid_input", "cannot remove yourself");
    const r = await tx`update public.organization_memberships set status = 'removed', removed_at = now()
                       where org_id = ${orgId} and user_id = ${targetUserId} and status = 'active' and role <> 'owner' returning user_id`;
    if (!r.length) throw new AppError("not_found");
    const seats = await tx<{ id: string }[]>`update public.seat_assignments set revoked_at = now(), revoked_by = ${actorId}
                                             where org_id = ${orgId} and user_id = ${targetUserId} and revoked_at is null returning id`;
    for (const s of seats) await tx`update public.entitlements set status = 'revoked', revoked_reason = 'member_removed' where source_kind = 'seat' and source_id = ${s.id}`;
    await audit(tx, actorId, orgId, "member.remove", "user", targetUserId);
    return { ok: true };
  });
}

/** CSV export of the same minimal report (manager-only via RLS function). */
export async function orgReportCsv(userId: string, orgId: string): Promise<string> {
  const rows = await withUser(userId, (tx) => tx<OrgMemberRow[]>`select * from public.org_member_progress(${orgId})`);
  const header = ["Нэр", "Үүрэг", "Идэвхтэй суудал", "Дууссан хичээл", "Эцсийн шалгалт", "Сертификатын дугаар"];
  const lines = rows.map((r) => [r.display_name, r.role, r.has_active_seat ? "тийм" : "үгүй", String(r.lessons_completed), r.final_passed ? "тэнцсэн" : "-", r.credential_number ?? ""]);
  return "﻿" + [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Escapes CSV and neutralizes spreadsheet formula injection. */
export function csvCell(v: string): string {
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
