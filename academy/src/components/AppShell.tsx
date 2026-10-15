import Link from "next/link";
import type { ReactNode } from "react";
import { dict, type Locale } from "@/messages";
import { LogoMark } from "./ui/Illustrations";
import { NavLink } from "./NavLink";

type Props = {
  locale: Locale;
  user: { email: string | null } | null;
  orgSlug: string | null;
  isStaff: boolean;
  demo: boolean;
  children: ReactNode;
};

const icons = {
  learn: <path d="M4 18l4-10 4 6 4-9 4 13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  explore: <><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>,
  review: <path d="M5 12a7 7 0 1 0 2.5-5.4M5 4v4h4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  profile: <><circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M4.5 20c1.2-4 4-5.5 7.5-5.5s6.3 1.5 7.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>,
  org: <><rect x="4" y="6" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M9 6V4h6v2M4 12h16" fill="none" stroke="currentColor" strokeWidth="2.2" /></>,
  admin: <path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />,
};
const Icon = ({ k }: { k: keyof typeof icons }) => <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">{icons[k]}</svg>;

export function AppShell({ locale, user, orgSlug, isStaff, demo, children }: Props) {
  const t = dict(locale);
  const base = `/${locale}`;
  const items: { href: string; label: string; icon: keyof typeof icons }[] = [
    { href: `${base}/learn/smm-foundations`, label: t.nav_learn, icon: "learn" },
    { href: `${base}/academies`, label: t.nav_explore, icon: "explore" },
    { href: `${base}/review`, label: t.nav_review, icon: "review" },
    { href: `${base}/me`, label: t.nav_profile, icon: "profile" },
  ];
  const extra: typeof items = [];
  if (orgSlug) extra.push({ href: `${base}/org/${orgSlug}`, label: t.nav_org, icon: "org" });
  if (isStaff) extra.push({ href: `${base}/admin/courses`, label: t.nav_admin, icon: "admin" });

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">Үндсэн агуулга руу шилжих</a>
      {demo && (
        <div className="bg-warning-soft px-4 py-1.5 text-center text-xs font-bold text-warning" role="note">
          {t.demo_banner}
        </div>
      )}
      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar (≥1024px) */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
          <Link href={base} className="mb-8 flex items-center gap-2 px-2 text-lg font-extrabold">
            <LogoMark /> {t.brand}
          </Link>
          <nav aria-label="Үндсэн цэс" className="flex flex-col gap-1">
            {[...items, ...extra].map((i) => (
              <NavLink key={i.href} href={i.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-muted hover:bg-lavender-soft hover:text-ink" activeClassName="bg-lavender-soft text-primary-strong">
                <Icon k={i.icon} /> {i.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto px-2 text-sm text-muted">
            {user ? (
              <form action="/api/auth/logout" method="post">
                <p className="mb-2 truncate" title={user.email ?? ""}>{user.email}</p>
                <button className="font-bold text-primary-strong hover:underline">{t.logout}</button>
              </form>
            ) : (
              <Link href={`${base}/login`} className="font-bold text-primary-strong hover:underline">{t.login}</Link>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile/tablet header */}
          <header className="flex items-center justify-between px-4 py-3 lg:hidden">
            <Link href={base} className="flex items-center gap-2 font-extrabold"><LogoMark size={28} /> {t.brand}</Link>
            <div className="flex items-center gap-3 text-sm font-bold">
              {extra.map((i) => <Link key={i.href} href={i.href} className="text-primary-strong">{i.label}</Link>)}
              {user ? (
                <form action="/api/auth/logout" method="post"><button className="text-muted">{t.logout}</button></form>
              ) : (
                <Link href={`${base}/login`} className="text-primary-strong">{t.login}</Link>
              )}
            </div>
          </header>
          <main id="main" className="px-4 pb-28 pt-2 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>
        </div>
      </div>

      {/* Mobile bottom tabs (<1024px) */}
      <nav aria-label="Доод цэс" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {items.map((i) => (
            <li key={i.href}>
              <NavLink href={i.href} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold text-muted" activeClassName="text-primary-strong">
                <Icon k={i.icon} />
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
