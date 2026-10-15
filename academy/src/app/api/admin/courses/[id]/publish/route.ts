import { z } from "zod";
import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { publishCourseVersion } from "@/features/admin/service";
import { uuidLike } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    const { note } = z.object({ note: z.string().min(3).max(500) }).parse(await readJson(req));
    return publishCourseVersion(user.id, uuidLike.parse((await params).id), note);
  });
}
