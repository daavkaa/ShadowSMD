import { api } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { completeLesson } from "@/features/learning/service";
import { uuidLike } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    return completeLesson(user.id, uuidLike.parse((await params).id));
  });
}
