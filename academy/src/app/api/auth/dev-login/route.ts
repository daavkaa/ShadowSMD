import { NextResponse } from "next/server";
import { z } from "zod";
import { api, readJson } from "@/lib/http";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { withService } from "@/lib/db/client";
import { DEV_COOKIE, signDevSession } from "@/lib/auth/dev-session";
import { rateLimit } from "@/lib/security/rate-limit";

const input = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** LOCAL/TEST ONLY. Disabled unless AUTH_MODE=dev (which getEnv() refuses in production). */
export async function POST(req: Request) {
  return api(req, async () => {
    const env = getEnv();
    if (env.AUTH_MODE !== "dev" || env.stage === "production") throw new AppError("not_found");
    rateLimit(`dev-login:${req.headers.get("x-forwarded-for") ?? "local"}`, 30, 60_000);
    const { email } = input.parse(await readJson(req));
    const userId = await withService(async (tx) => {
      const [u] = await tx<{ id: string }[]>`select id from auth.users where email = ${email}`;
      if (u) return u.id;
      const [created] = await tx<{ id: string }[]>`insert into auth.users (email, raw_user_meta_data) values (${email}, ${tx.json({ display_name: email.split("@")[0] })}) returning id`;
      await tx`insert into public.product_events (user_id, event_name) values (${created!.id}, 'signup_completed')`;
      return created!.id;
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(DEV_COOKIE, signDevSession(env.DEV_AUTH_SECRET!, userId), {
      httpOnly: true, sameSite: "lax", secure: env.APP_URL.startsWith("https://"), path: "/", maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  });
}
