import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageTitle } from "@/components/ui";
import { listCoursesForAdmin } from "@/features/admin/service";
import { isAppError } from "@/lib/errors";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Админ · Сургалтууд" };
export const dynamic = "force-dynamic";

export default async function AdminCourses({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await requirePageUser(locale, `/${locale}/admin/courses`);
  let courses;
  try {
    courses = await listCoursesForAdmin(user.id);
  } catch (e) {
    if (isAppError(e) && e.code === "forbidden") notFound();
    throw e;
  }
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle sub="Агуулгыг код deploy хийлгүйгээр засна. Өөрчлөлт бүр аудитын бүртгэлд хадгалагдана.">Сургалтын агуулга</PageTitle>
      <Card>
        <ul className="divide-y divide-line">
          {courses.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link href={`/${locale}/admin/courses/${c.id}`} className="font-bold text-primary-strong hover:underline">{c.title}</Link>
                <p className="text-sm text-muted">v{c.version} · {c.lessons} хичээл · хянасан {c.reviewed_at ?? "—"}</p>
              </div>
              <Badge tone={c.status === "published" ? "success" : "neutral"}>{c.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
