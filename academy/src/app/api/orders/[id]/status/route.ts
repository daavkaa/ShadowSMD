import { NextResponse } from "next/server";
import { api } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { getOrderForUser, refreshOrderFromProvider } from "@/features/commerce/orders";
import { AppError } from "@/lib/errors";

/** Poll endpoint: asks the provider (server-to-server) and returns the authoritative DB status. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const user = await requireUser();
    const { id } = await params;
    const before = await getOrderForUser(user.id, id);
    if (!before) throw new AppError("not_found");
    if (before.status === "pending") await refreshOrderFromProvider(id, { userId: user.id });
    const order = await getOrderForUser(user.id, id);
    return NextResponse.json({ status: order!.status, paidAt: order!.paid_at }, { headers: { "Cache-Control": "no-store" } });
  });
}
