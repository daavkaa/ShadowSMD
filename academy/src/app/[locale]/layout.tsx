import { AppShell } from "@/components/AppShell";
import { assertLocale, currentUser, isDemoEnvironment } from "@/lib/page-context";
import { listMyOrganizations } from "@/features/organizations/service";
import { isStaff } from "@/features/admin/service";

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  const user = await currentUser();
  let orgSlug: string | null = null;
  let staff = false;
  if (user) {
    const orgs = await listMyOrganizations(user.id);
    orgSlug = orgs.find((o) => o.role === "owner" || o.role === "manager")?.slug ?? null;
    staff = await isStaff(user.id);
  }
  return (
    <AppShell locale={locale} user={user} orgSlug={orgSlug} isStaff={staff} demo={isDemoEnvironment()}>
      {children}
    </AppShell>
  );
}
