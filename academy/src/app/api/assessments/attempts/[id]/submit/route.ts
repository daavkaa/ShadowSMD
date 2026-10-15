import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { submitAttempt } from "@/features/assessments/service";
import { uuidLike } from "@/lib/validation";

/** Pass/fail is computed on the server from private answer keys. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    return submitAttempt(user.id, uuidLike.parse((await params).id), await readJson(req));
  });
}
