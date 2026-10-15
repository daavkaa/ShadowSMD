import { describe, expect, it } from "vitest";
import { admin, asUser, createUser, ids } from "../support/db";
import { buyWithDemo, finishLesson } from "../support/flows";

describe("RLS: catalog and premium content", () => {
  it("anon and free learners see free steps but zero premium steps", async () => {
    const lessons = await ids.lessons();
    const premium = lessons.filter((l) => l.access_tier === "premium").map((l) => l.id);
    const free = lessons.filter((l) => l.access_tier === "free").map((l) => l.id);
    const u = await createUser();
    for (const who of [null, u.id]) {
      const rows = await asUser(who, (tx) => tx<{ lesson_id: string }[]>`select lesson_id from public.lesson_steps`);
      expect(rows.some((r) => premium.includes(r.lesson_id))).toBe(false);
      expect(rows.some((r) => free.includes(r.lesson_id))).toBe(true);
    }
  });

  it("answer keys and exam questions are never readable by clients", async () => {
    const u = await createUser();
    await expect(asUser(u.id, (tx) => tx`select * from public.lesson_step_keys limit 1`)).rejects.toThrow(/permission denied/);
    await expect(asUser(u.id, (tx) => tx`select * from public.assessment_question_keys limit 1`)).rejects.toThrow(/permission denied/);
    await expect(asUser(u.id, (tx) => tx`select * from public.assessment_questions limit 1`)).rejects.toThrow(/permission denied/);
    await expect(asUser(null, (tx) => tx`select * from public.coupons limit 1`)).rejects.toThrow(/permission denied/);
  });

  it("internal access function is not callable by clients (no purchase-state leaks)", async () => {
    const u = await createUser();
    const course = await ids.course();
    await expect(asUser(u.id, (tx) => tx`select public.has_premium_access(${u.id}, ${course})`)).rejects.toThrow(/permission denied/);
  });

  it("clients cannot write entitlements, orders, progress or XP directly", async () => {
    const u = await createUser();
    const course = await ids.course();
    await expect(asUser(u.id, (tx) => tx`insert into public.entitlements (subject_user_id, scope_kind, source_kind, source_id) values (${u.id}, 'library_pro', 'admin_grant', ${u.id})`)).rejects.toThrow(/permission denied/);
    await expect(asUser(u.id, (tx) => tx`insert into public.xp_ledger (user_id, event_type, source_id, points) values (${u.id}, 'exam_pass', 'x', 100)`)).rejects.toThrow(/permission denied/);
    await expect(asUser(u.id, (tx) => tx`update public.orders set status = 'paid' where buyer_user_id = ${u.id}`)).rejects.toThrow(/permission denied/);
    await expect(asUser(u.id, (tx) => tx`insert into public.enrollments (user_id, course_id) values (${u.id}, ${course})`)).rejects.toThrow(/permission denied/);
  });

  it("profile updates are limited to own row and safe columns", async () => {
    const a = await createUser("A");
    const b = await createUser("B");
    await asUser(a.id, (tx) => tx`update public.profiles set display_name = 'Шинэ нэр' where id = ${b.id}`);
    const [pb] = await admin<{ display_name: string }[]>`select display_name from public.profiles where id = ${b.id}`;
    expect(pb!.display_name).toBe("B");
    await expect(asUser(a.id, (tx) => tx`update public.profiles set created_at = now() where id = ${a.id}`)).rejects.toThrow(/permission denied/);
  });
});

describe("RLS: learner isolation (horizontal privilege escalation)", () => {
  it("a learner cannot read another learner's progress, responses, orders, entitlements or credentials", async () => {
    const victim = await createUser("Хохирогч");
    const attacker = await createUser("Халдагч");
    const [first] = await ids.lessons();
    await finishLesson(victim.id, first!.id);
    await buyWithDemo(victim.id);
    const counts = await asUser(attacker.id, async (tx) => {
      const q = async (t: string) => (await tx.unsafe(`select count(*)::int as n from public.${t}`))[0]!.n as number;
      return { lp: await q("lesson_progress"), sr: await q("step_responses"), o: await q("orders"), e: await q("entitlements"), p: await q("payments"), x: await q("xp_ledger"), s: await q("subscriptions") };
    });
    expect(counts).toEqual({ lp: 0, sr: 0, o: 0, e: 0, p: 0, x: 0, s: 0 });
    const own = await asUser(victim.id, (tx) => tx<{ n: number }[]>`select count(*)::int as n from public.orders`);
    expect(own[0]!.n).toBe(1);
  });
});

describe("RLS: organization tenant isolation", () => {
  it("manager of org A cannot read org B, its members, seats, invitations or report", async () => {
    const managerA = await ids.demoUser("manager");
    const orgB = await ids.org("other-company");
    const r = await asUser(managerA, async (tx) => ({
      orgs: await tx`select * from public.organizations where id = ${orgB}`,
      members: await tx`select * from public.organization_memberships where org_id = ${orgB}`,
      pools: await tx`select * from public.seat_pools where org_id = ${orgB}`,
      seats: await tx`select * from public.seat_assignments where org_id = ${orgB}`,
      invites: await tx`select * from public.organization_invitations where org_id = ${orgB}`,
    }));
    expect(r.orgs.length + r.members.length + r.pools.length + r.seats.length + r.invites.length).toBe(0);
    await expect(asUser(managerA, (tx) => tx`select * from public.org_member_progress(${orgB})`)).rejects.toThrow(/not_org_manager/);
  });

  it("org managers get only the minimal aggregate report, never raw learner tables", async () => {
    const managerA = await ids.demoUser("manager");
    const employee = await ids.demoUser("employee");
    const orgA = await ids.org("demo-agency");
    const [first] = await ids.lessons();
    await finishLesson(employee, first!.id);
    const report = await asUser(managerA, (tx) => tx`select * from public.org_member_progress(${orgA})`);
    const row = report.find((r) => r.user_id === employee)!;
    expect(row.lessons_completed).toBeGreaterThanOrEqual(1);
    expect(Object.keys(row).sort()).toEqual(["credential_number", "display_name", "final_passed", "has_active_seat", "lessons_completed", "role", "user_id"]);
    const raw = await asUser(managerA, (tx) => tx`select * from public.step_responses where user_id = ${employee}`);
    expect(raw.length).toBe(0);
    const profile = await asUser(managerA, (tx) => tx`select * from public.profiles where id = ${employee}`);
    expect(profile.length).toBe(0);
  });

  it("plain members cannot run the manager report for their own org", async () => {
    const employee = await ids.demoUser("employee");
    const orgA = await ids.org("demo-agency");
    await expect(asUser(employee, (tx) => tx`select * from public.org_member_progress(${orgA})`)).rejects.toThrow(/not_org_manager/);
  });
});
