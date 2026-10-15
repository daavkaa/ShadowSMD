import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { inviteMember } from "@/features/organizations/service";
import { uuidLike } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    return inviteMember(user.id, uuidLike.parse((await params).id), (await readJson(req)) as never);
  });
}
