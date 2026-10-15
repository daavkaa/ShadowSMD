"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, className, activeClassName, children }: { href: string; className: string; activeClassName: string; children: ReactNode }) {
  const path = usePathname();
  const section = href.split("/").slice(0, 3).join("/");
  const active = path === href || (section.length > 3 && path.startsWith(section));
  return (
    <Link href={href} className={`${className} ${active ? activeClassName : ""}`} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
