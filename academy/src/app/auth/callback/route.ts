import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";

/** Supabase PKCE / magic-link callback: exchanges the code for a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const base = getEnv().APP_URL;
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, base));
  }
  return NextResponse.redirect(new URL("/mn/login?error=callback", base));
}
