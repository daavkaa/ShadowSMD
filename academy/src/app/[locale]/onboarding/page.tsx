import { redirect } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { OnboardingForm } from "@/components/OnboardingForm";
import { getProfile } from "@/features/catalog/profile";
import { assertLocale, requirePageUser } from "@/lib/page-context";

export const metadata = { title: "Эхлэх" };

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await requirePageUser(locale, `/${locale}/onboarding`);
  const profile = await getProfile(user.id);
  if (profile?.onboarded_at) redirect(`/${locale}/learn/smm-foundations`);
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle sub="2 асуулт — таньд тохирох замыг санал болгоно.">Тавтай морил!</PageTitle>
      <Card><OnboardingForm locale={locale} defaultName={profile?.display_name ?? ""} /></Card>
    </div>
  );
}
