import Link from "next/link";
import { Badge, Card, PageTitle } from "@/components/ui";
import { listAcademies } from "@/features/catalog/queries";
import { assertLocale, currentUser } from "@/lib/page-context";

export const metadata = { title: "Академиуд" };

export default async function Academies({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await currentUser();
  const academies = await listAcademies(user?.id ?? null);
  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle sub="Нэг бүртгэлээр олон академи. Шинэ сургалтыг чанарын шалгалтын дараа нээнэ.">Судлах</PageTitle>
      {academies.length === 0 && <Card><p>Одоогоор нийтлэгдсэн академи алга.</p></Card>}
      <div className="space-y-6">
        {academies.map((a) => (
          <section key={a.id} aria-labelledby={`a-${a.id}`}>
            <h2 id={`a-${a.id}`} className="mb-3 text-xl font-extrabold">{a.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {a.courses.map((c) => (
                <Card key={c.id} className={c.status === "coming_soon" ? "opacity-75" : ""}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-muted">{c.track_title}</p>
                    {c.status === "coming_soon" ? <Badge>Тун удахгүй</Badge> : <Badge tone="success">{c.lesson_count} түвшин + шалгалт</Badge>}
                  </div>
                  <h3 className="mt-1 text-lg font-extrabold">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted">{c.summary}</p>
                  {c.status === "published" && (
                    <Link href={`/${locale}/courses/${c.slug}`} className="mt-3 inline-block font-bold text-primary-strong hover:underline">Дэлгэрэнгүй</Link>
                  )}
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
