import { redirect } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { getEnv } from "@/lib/env";
import { assertLocale, currentUser } from "@/lib/page-context";
import { safeNext } from "@/lib/safe-redirect";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Нэвтрэх" };

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const locale = assertLocale((await params).locale);
  const next = safeNext((await searchParams).next, `/${locale}/onboarding`);
  if (await currentUser()) redirect(next);
  const env = getEnv();
  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub="Ахиц, XP, сертификатаа хадгалахын тулд бүртгэл хэрэгтэй. Төлбөрийн мэдээлэл шаардахгүй.">Нэвтрэх / Бүртгүүлэх</PageTitle>
      <Card>
        <LoginForm
          mode={env.AUTH_MODE}
          next={next}
          supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL ?? null}
          supabaseAnonKey={env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null}
        />
      </Card>
      <p className="mt-4 text-xs text-muted">
        Бүртгүүлснээр та үйлчилгээний нөхцөл, нууцлалын бодлогыг (хуулийн зөвлөхөөр хянагдах ноорог) зөвшөөрч байна.
      </p>
    </div>
  );
}
