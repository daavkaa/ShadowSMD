import { z } from "zod";
import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { removeMember } from "@/features/organizations/service";
import { uuidLike } from "@/lib/validation";

/** Tenant + role checks happen inside the service against DB state (never client claims). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    const orgId = uuidLike.parse((await params).id);
    const { userId } = z.object({ userId: uuidLike }).parse(await readJson(req));
    return removeMember(user.id, orgId, userId);
  });
}
