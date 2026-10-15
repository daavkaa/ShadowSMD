import { beforeEach, describe, expect, it } from "vitest";
import { acceptInvitation, assignSeat, getOrgDashboard, inviteMember, orgReportCsv, removeMember, revokeSeat } from "@/features/organizations/service";
import { getLessonForPlayer } from "@/features/learning/service";
import { resetRateLimits } from "@/lib/security/rate-limit";
import { admin, createUser, ids } from "../support/db";
import { finishLesson } from "../support/flows";

beforeEach(() => resetRateLimits());

describe("B2B seats and privacy", () => {
  it("seat holder gets premium access; dashboard is manager-only and tenant-scoped", async () => {
    const employee = await ids.demoUser("employee");
    const premium = (await ids.lessons()).find((l) => l.access_tier === "premium")!;
    for (const l of (await ids.lessons()).filter((x) => x.access_tier === "free")) await finishLesson(employee, l.id);
    expect((await getLessonForPlayer(employee, premium.id)).steps.length).toBeGreaterThan(0);

    const manager = await ids.demoUser("manager");
    const dash = await getOrgDashboard(manager, "demo-agency");
    expect(dash.members.map((m) => m.user_id)).toContain(employee);
    expect(dash.members.map((m) => m.user_id)).not.toContain(await ids.demoUser("other-employee"));
    await expect(getOrgDashboard(manager, "other-company")).rejects.toMatchObject({ code: "not_found" });
    await expect(getOrgDashboard(employee, "demo-agency")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a manager cannot assign/revoke seats in another tenant or to outsiders", async () => {
    const manager = await ids.demoUser("manager");
    const orgA = await ids.org("demo-agency");
    const orgB = await ids.org("other-company");
    const otherEmployee = await ids.demoUser("other-employee");
    await expect(assignSeat(manager, orgB, otherEmployee)).rejects.toMatchObject({ code: "forbidden" });
    await expect(assignSeat(manager, orgA, otherEmployee)).rejects.toMatchObject({ code: "not_org_member" });
    const [seatB] = await admin<{ id: string }[]>`select id from public.seat_assignments where org_id = ${orgB} and revoked_at is null limit 1`;
    await expect(revokeSeat(manager, orgA, seatB!.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(revokeSeat(manager, orgB, seatB!.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("invite → accept → assign → revoke keeps the learner's progress", async () => {
    const manager = await ids.demoUser("manager");
    const orgA = await ids.org("demo-agency");
    const newbie = await createUser("Шинэ ажилтан");
    const { link } = await inviteMember(manager, orgA, { email: newbie.email.toUpperCase() });
    const token = link.split("/invite/")[1]!;
    const stranger = await createUser();
    await expect(acceptInvitation(stranger.id, stranger.email, token)).rejects.toMatchObject({ code: "invitation_email_mismatch" });
    expect(await acceptInvitation(newbie.id, newbie.email, token)).toMatchObject({ orgSlug: "demo-agency" });
    await expect(acceptInvitation(newbie.id, newbie.email, token)).rejects.toMatchObject({ code: "invitation_invalid" });
    const [stored] = await admin<{ token_hash: string }[]>`select token_hash from public.organization_invitations where org_id = ${orgA} order by created_at desc limit 1`;
    expect(stored!.token_hash).not.toContain(token); // only the hash is stored

    const { assignmentId } = await assignSeat(manager, orgA, newbie.id);
    const [first] = await ids.lessons();
    await finishLesson(newbie.id, first!.id);
    await revokeSeat(manager, orgA, assignmentId);
    const [ent] = await admin`select status from public.entitlements where source_kind = 'seat' and source_id = ${assignmentId}`;
    expect(ent!.status).toBe("revoked");
    const progress = await admin`select * from public.lesson_progress where user_id = ${newbie.id}`;
    expect(progress).toHaveLength(1);

    await removeMember(manager, orgA, newbie.id);
    const dash = await getOrgDashboard(manager, "demo-agency");
    expect(dash.members.map((m) => m.user_id)).not.toContain(newbie.id);
  });

  it("enforces seat capacity", async () => {
    const manager = await ids.demoUser("manager");
    const orgA = await ids.org("demo-agency");
    const [pool] = await admin<{ id: string; purchased_seats: number }[]>`select id, purchased_seats from public.seat_pools where org_id = ${orgA}`;
    const [{ used }] = (await admin<{ used: number }[]>`select count(*)::int as used from public.seat_assignments where seat_pool_id = ${pool!.id} and revoked_at is null`) as unknown as [{ used: number }];
    const free = pool!.purchased_seats - used;
    const users = [];
    for (let i = 0; i < free + 1; i++) {
      const u = await createUser("Ажилтан " + i);
      await admin`insert into public.organization_memberships (org_id, user_id, role) values (${orgA}, ${u.id}, 'member')`;
      users.push(u);
    }
    for (let i = 0; i < free; i++) await assignSeat(manager, orgA, users[i]!.id);
    await expect(assignSeat(manager, orgA, users[free]!.id)).rejects.toMatchObject({ code: "no_seats_available" });
  });

  it("CSV report is manager-only and contains no emails", async () => {
    const manager = await ids.demoUser("manager");
    const orgA = await ids.org("demo-agency");
    const csv = await orgReportCsv(manager, orgA);
    expect(csv).toContain("Тэмүүлэн");
    expect(csv).not.toMatch(/@/);
    await expect(orgReportCsv(await ids.demoUser("other-manager"), orgA)).rejects.toThrow(/not_org_manager/);
  });
});
