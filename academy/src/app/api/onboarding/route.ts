import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { saveOnboarding } from "@/features/catalog/profile";
import { track } from "@/features/analytics/track";

export async function POST(req: Request) {
  return api(req, async () => {
    const user = await requireUser();
    await saveOnboarding(user.id, await readJson(req));
    await track(user.id, "onboarding_completed");
    return { ok: true };
  });
}
