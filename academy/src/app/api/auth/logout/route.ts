import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { DEV_COOKIE } from "@/lib/auth/dev-session";
import { createSupabaseServerClient } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const env = getEnv();
    const res = NextResponse.redirect(new URL("/mn", env.APP_URL), { status: 303 });
    if (env.AUTH_MODE === "dev") res.cookies.delete(DEV_COOKIE);
    else await (await createSupabaseServerClient()).auth.signOut();
    return res;
  } catch (e) {
    return jsonError(e);
  }
}
