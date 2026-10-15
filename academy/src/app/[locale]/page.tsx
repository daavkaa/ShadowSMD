import Link from "next/link";
import { ButtonLink, Card, Badge } from "@/components/ui";
import { SparkGuide, TrophyBadge } from "@/components/ui/Illustrations";
import { listAcademies, listPlans } from "@/features/catalog/queries";
import { formatMnt } from "@/features/commerce/pricing";
import { track } from "@/features/analytics/track";
import { assertLocale, currentUser } from "@/lib/page-context";

export default async function Landing({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await currentUser();
  const [academies, plans] = await Promise.all([listAcademies(user?.id ?? null), listPlans(user?.id ?? null)]);
  await track(user?.id ?? null, "landing_viewed");
  const pro = plans.filter((p) => p.product_code === "pro_library");
  const bundle = plans.find((p) => p.product_code === "smm_bundle");
  const startHref = user ? `/${locale}/learn/smm-foundations` : `/${locale}/login?next=${encodeURIComponent(`/${locale}/onboarding`)}`;

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <section className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-10 text-white sm:px-10 sm:py-14">
        <div className="relative z-10 max-w-xl">
          <Badge tone="primary">Сошиал медиа маркетингийн академи нээгдлээ</Badge>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">
            Өдөр бүр бага багаар сураад ажил дээрээ ашиглах бодит ур чадвартай бол.
          </h1>
          <p className="mt-4 text-lavender">
            Page тохиргооноос Boost, Ads Manager, targeting, аналитик хүртэл — богино хичээл, практик дасгал, эцсийн шалгалт.
            Эхний 3 түвшин үнэгүй, карт шаардахгүй.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={startHref}>Үнэгүй эхлэх</ButtonLink>
            <ButtonLink href={`/${locale}/courses/smm-foundations`} variant="secondary">Хөтөлбөр харах</ButtonLink>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-6 bottom-0 hidden opacity-90 sm:block" aria-hidden="true">
          <TrophyBadge size={220} />
        </div>
      </section>

      <section aria-labelledby="how" className="grid gap-4 sm:grid-cols-3">
        <h2 id="how" className="sr-only">Хэрхэн ажилладаг вэ</h2>
        {[
          ["1. Үнэгүй эхэл", "Эхний 3 түвшнийг бүртгүүлээд шууд үзнэ. Төлбөрийн мэдээлэл хэрэггүй."],
          ["2. Дасгалаар бэхжүүл", "Сценари, тооцоолол, дараалал оруулах асуултууд. Алдсан асуултаа давтлагаар сэргээнэ."],
          ["3. Шалгалт өгч баталгаажуул", "Эцсийн шалгалтад 80%+ авбал онлайнаар шалгагдах сертификат олгоно."],
        ].map(([t, d]) => (
          <Card key={t}>
            <h3 className="font-extrabold">{t}</h3>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </Card>
        ))}
      </section>

      <section aria-labelledby="academies">
        <h2 id="academies" className="mb-4 text-2xl font-extrabold">Академиуд</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {academies.map((a) => (
            <Card key={a.id}>
              <h3 className="text-lg font-extrabold">{a.title}</h3>
              <p className="mt-1 text-sm text-muted">{a.description}</p>
              <ul className="mt-4 space-y-2">
                {a.courses.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    {c.status === "published" ? (
                      <Link href={`/${locale}/courses/${c.slug}`} className="font-bold text-primary-strong hover:underline">{c.title}</Link>
                    ) : (
                      <span className="text-muted">{c.title}</span>
                    )}
                    {c.status === "coming_soon" ? <Badge>Тун удахгүй</Badge> : <Badge tone="success">Нээлттэй</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          Шинэ сургалтуудыг эрэлт, багшийн чанарыг шалгасны дараа нээнэ. «Тун удахгүй» гэсэн сургалт одоогоор худалдаалагдахгүй.
        </p>
      </section>

      <section aria-labelledby="pricing">
        <h2 id="pricing" className="mb-4 text-2xl font-extrabold">Үнэ (туршилтын үнэ)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {pro.map((p) => (
            <Card key={p.price_id}>
              <p className="text-sm font-bold text-muted">{p.billing_interval === "month" ? "Professional · 30 хоног" : "Professional · 365 хоног"}</p>
              <p className="mt-1 text-3xl font-extrabold">{formatMnt(p.amount_mnt)}</p>
              <p className="mt-2 text-sm text-muted">Урьдчилж төлөх хугацаатай эрх. Автоматаар сунгагдахгүй.</p>
            </Card>
          ))}
          {bundle && (
            <Card>
              <p className="text-sm font-bold text-muted">Маркетингийн багц · нэг удаа</p>
              <p className="mt-1 text-3xl font-extrabold">{formatMnt(bundle.amount_mnt)}</p>
              <p className="mt-2 text-sm text-muted">Зөвхөн багцад нэрлэгдсэн сургалтууд. Ирээдүйн бусад сургалт орохгүй.</p>
            </Card>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">Үнэ НӨАТ-ыг багтаасан гэж харуулж байна; эцсийн татварын нөхцөлийг нягтлан бодогчоор баталгаажуулна.</p>
      </section>

      <section aria-labelledby="b2b">
        <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <SparkGuide size={72} />
          <div className="flex-1">
            <h2 id="b2b" className="text-xl font-extrabold">Байгууллагад</h2>
            <p className="mt-1 text-sm text-muted">
              Маркетингийн багийнхаа ур чадварыг үнэлж, суудлын лиценз, хичээлийн явцын нэгтгэсэн тайлан, сертификатын бүртгэлтэйгээр сургаарай.
              Ажилтны хувийн хариултыг менежерт харуулахгүй.
            </p>
          </div>
          <a className="font-bold text-primary-strong hover:underline" href="mailto:sales@example.mn?subject=B2B%20demo">Демо захиалах</a>
        </Card>
      </section>

      <footer className="border-t border-line pt-6 text-xs text-muted">
        <p>
          Энэ платформ нь бие даасан хувийн сургалтын үйлчилгээ бөгөөд Meta Platforms, Inc.-тэй холбоогүй. Олгох сертификат нь академийн өөрийн
          сертификат бөгөөд Meta Blueprint эсвэл төрийн магадлан итгэмжлэгдсэн баримт бичиг биш. Орлого, ажлын байр, үр дүнг баталгаажуулахгүй.
        </p>
      </footer>
    </div>
  );
}
