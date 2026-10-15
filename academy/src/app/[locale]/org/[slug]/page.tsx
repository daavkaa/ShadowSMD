import { notFound } from "next/navigation";
import { Alert, Badge, Card, PageTitle, formatDate } from "@/components/ui";
import { InviteForm, MemberActions } from "@/components/org/OrgActions";
import { getOrgDashboard } from "@/features/organizations/service";
import { isAppError } from "@/lib/errors";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Байгууллага" };
export const dynamic = "force-dynamic";

export default async function OrgPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: l, slug } = await params;
  const locale = assertLocale(l);
  const user = await requirePageUser(locale, `/${locale}/org/${slug}`);
  let d;
  try {
    d = await getOrgDashboard(user.id, slug);
  } catch (e) {
    if (isAppError(e) && (e.code === "not_found" || e.code === "forbidden")) notFound(); // do not reveal other tenants
    throw e;
  }
  const pool = d.seatPools[0];
  const seatByUser = new Map(d.assignments.map((a) => [a.user_id, a.id]));
  const total = d.assignedCourses[0]?.lesson_count ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageTitle sub="Менежерийн самбар · зөвхөн нэгтгэсэн явц харагдана">{d.org.name}</PageTitle>
      {d.org.pilot_ends_at && <Alert tone="primary" title="7 хоногийн туршилтын эрх">Дуусах огноо: {formatDate(d.org.pilot_ends_at)}. Үргэлжлүүлэх бол жилийн гэрээ, нэхэмжлэлээр.</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs font-bold text-muted">Суудал</p><p className="text-2xl font-extrabold" data-testid="seat-usage">{pool ? `${pool.used_seats}/${pool.purchased_seats}` : "—"}</p>{pool && <p className="text-xs text-muted">Хүчинтэй: {formatDate(pool.active_until)} хүртэл</p>}</Card>
        <Card><p className="text-xs font-bold text-muted">Гишүүд</p><p className="text-2xl font-extrabold">{d.members.length}</p></Card>
        <Card><p className="text-xs font-bold text-muted">Эцсийн шалгалтад тэнцсэн</p><p className="text-2xl font-extrabold">{d.members.filter((m) => m.final_passed).length}</p></Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">Ажилтнуудын явц</h2>
          <a href={`/api/orgs/${d.org.id}/report`} className="text-sm font-bold text-primary-strong underline">CSV татах</a>
        </div>
        {d.assignedCourses.map((c) => (
          <p key={c.course_id} className="mb-3 text-sm text-muted">Оноосон зам: <strong>{c.title}</strong>{c.due_date ? ` · Дуусгах: ${c.due_date}` : ""}</p>
        ))}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr><th className="py-2">Нэр</th><th>Үүрэг</th><th>Хичээл</th><th>Шалгалт</th><th>Суудал</th><th><span className="sr-only">Үйлдэл</span></th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.members.map((m) => (
                <tr key={m.user_id}>
                  <td className="py-3 font-bold">{m.display_name || "—"}</td>
                  <td>{m.role === "member" ? "Ажилтан" : m.role === "owner" ? "Эзэмшигч" : "Менежер"}</td>
                  <td>{m.lessons_completed}/{total}</td>
                  <td>{m.final_passed ? <Badge tone="success">Тэнцсэн · {m.credential_number}</Badge> : <span className="text-muted">—</span>}</td>
                  <td>{m.has_active_seat ? <Badge tone="primary">Идэвхтэй</Badge> : <span className="text-muted">Байхгүй</span>}</td>
                  <td><MemberActions orgId={d.org.id} userId={m.user_id} assignmentId={seatByUser.get(m.user_id) ?? null} canRemove={m.role === "member"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Нууцлал: менежер ажилтны хариулт, имэйл, нэвтэрсэн цаг зэрэг дэлгэрэнгүйг харахгүй. Суудал хасахад ажилтны ахиц, сертификат түүнд хадгалагдана.</p>
      </Card>

      <Card>
        <h2 className="text-lg font-extrabold">Ажилтан урих</h2>
        <InviteForm orgId={d.org.id} />
        {d.invitations.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {d.invitations.map((i) => (
              <li key={i.id} className="flex justify-between gap-2"><span>{i.email}</span><span className="text-muted">{i.accepted_at ? "Хүлээн авсан" : `Хүчинтэй: ${formatDate(i.expires_at)}`}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
