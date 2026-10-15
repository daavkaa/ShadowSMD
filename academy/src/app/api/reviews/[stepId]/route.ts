import { z } from "zod";
import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { submitReview } from "@/features/learning/service";
import { uuidLike } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ stepId: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    const { answer } = z.object({ answer: z.unknown() }).parse(await readJson(req));
    return submitReview(user.id, uuidLike.parse((await params).stepId), answer);
  });
}
