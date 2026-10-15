import { api } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { cancelOrder } from "@/features/commerce/orders";
import { uuidLike } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    return cancelOrder(user.id, uuidLike.parse((await params).id));
  });
}
