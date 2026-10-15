import { api, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { createOrder } from "@/features/commerce/orders";

/** Client names a price code only; amount/scope/provider are derived server-side. */
export async function POST(req: Request) {
  return api(req, async () => {
    const user = await requireUser();
    return createOrder(user.id, (await readJson(req)) as never);
  });
}
