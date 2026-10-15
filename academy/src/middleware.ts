import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Refreshes Supabase auth cookies on navigation (AUTH_MODE=supabase only). */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  if (process.env.AUTH_MODE === "dev") return res;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|sw.js|manifest.webmanifest|api/webhooks|favicon.ico).*)"],
};
