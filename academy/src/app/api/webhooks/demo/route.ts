import { api } from "@/lib/http";
import { handleDemoWebhook } from "@/features/commerce/webhooks";

export async function POST(req: Request) {
  return api(req, async () => handleDemoWebhook(await req.text(), req.headers.get("x-demo-signature")), { csrf: false });
}
