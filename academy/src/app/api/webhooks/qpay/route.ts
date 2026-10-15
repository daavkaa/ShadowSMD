import { api } from "@/lib/http";
import { handleQpayCallback } from "@/features/commerce/webhooks";

// QPay callback (method/payload format to be confirmed in sandbox). We accept GET
// and POST, authenticate the order via the HMAC token we put in callback_url, and
// confirm payment by querying QPay's payment check API — never from the payload.
async function handle(req: Request) {
  const url = new URL(req.url);
  const raw = req.method === "POST" ? await req.text() : url.search;
  return api(req, async () => {
    const r = await handleQpayCallback(url.searchParams.get("order"), url.searchParams.get("token"), raw);
    return { ok: true, status: r.status };
  }, { csrf: false });
}
export const GET = handle;
export const POST = handle;
