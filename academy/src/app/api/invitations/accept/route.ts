import { z } from "zod";
import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { acceptInvitation } from "@/features/organizations/service";

export async function POST(req: Request) {
  return api(req, async () => {
    const user = await requireUser();
    const { token } = z.object({ token: z.string().max(200) }).parse(await readJson(req));
    return acceptInvitation(user.id, user.email, token);
  });
}
