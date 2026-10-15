import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { isLocale, type Locale } from "@/messages";

export const currentUser = cache(getSessionUser);

export function assertLocale(locale: string): Locale {
  if (!isLocale(locale)) notFound();
  return locale;
}

/** For pages that require sign-in: redirect to login with a safe relative return path. */
export async function requirePageUser(locale: Locale, returnTo: string) {
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export function isDemoEnvironment() {
  const env = getEnv();
  return env.PAYMENT_PROVIDER === "demo" || env.AUTH_MODE === "dev";
}
