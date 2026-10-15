import { NextResponse } from "next/server";

/** Recurring-card webhooks are not accepted until the Bonum contract and signature scheme are confirmed. */
export async function POST() {
  return NextResponse.json({ error: { code: "provider_not_configured" } }, { status: 501 });
}
