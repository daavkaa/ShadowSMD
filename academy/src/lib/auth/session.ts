import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { DEV_COOKIE, verifyDevSession } from "./dev-session";
import { withService } from "@/lib/db/client";

export type SessionUser = { id: string; email: string | null };

export async function createSupabaseServerClient() {
  const env = getEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only; middleware refreshes them.
        }
      },
    },
  });
}

/** Returns the authenticated user verified server-side, or null. Never trusts client claims. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const env = getEnv();
  if (env.AUTH_MODE === "dev") {
    const cookieStore = await cookies();
    const userId = verifyDevSession(env.DEV_AUTH_SECRET!, cookieStore.get(DEV_COOKIE)?.value);
    if (!userId) return null;
    const rows = await withService((tx) => tx<{ email: string | null }[]>`select email from auth.users where id = ${userId}`);
    if (!rows[0]) return null;
    return { id: userId, email: rows[0].email };
  }
  const supabase = await createSupabaseServerClient();
  // getUser() validates the JWT with Supabase Auth (unlike getSession()).
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("unauthenticated");
  return user;
}
