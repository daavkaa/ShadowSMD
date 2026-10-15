import { z } from "zod";
import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { submitStep } from "@/features/learning/service";
import { uuidLike } from "@/lib/validation";

const body = z.object({ answer: z.unknown() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    const id = uuidLike.parse((await params).id);
    const { answer } = body.parse(await readJson(req));
    return submitStep(user.id, id, answer);
  });
}
