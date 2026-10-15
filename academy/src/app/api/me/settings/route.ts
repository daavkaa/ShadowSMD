import { z } from "zod";
import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { setCredentialNameVisibility } from "@/features/catalog/profile";

export async function POST(req: Request) {
  return api(req, async () => {
    const user = await requireUser();
    const { showNameOnCredentials } = z.object({ showNameOnCredentials: z.boolean() }).parse(await readJson(req));
    await setCredentialNameVisibility(user.id, showNameOnCredentials);
    return { ok: true };
  });
}
