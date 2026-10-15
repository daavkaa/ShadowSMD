import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { getMyCredential, verificationUrl } from "@/features/credentials/service";
import { renderCertificatePdf } from "@/features/credentials/pdf";
import { withService } from "@/lib/db/client";
import { track } from "@/features/analytics/track";

export const runtime = "nodejs";

/** Owner-only PDF (RLS read). Generated on demand so revocation/corrections are always reflected. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const c = await getMyCredential(user.id, (await params).id);
    if (!c) throw new AppError("not_found");
    if (c.revoked_at) throw new AppError("forbidden", "credential revoked");
    const pdf = await renderCertificatePdf({
      holderName: c.holder_name, title: c.credential_title, credentialNumber: c.credential_number, issuedAt: new Date(c.issued_at),
      issuerName: c.issuer_name, verifyUrl: verificationUrl(c.public_id), isDemo: c.is_demo,
    });
    await withService((tx) => tx`insert into public.credential_events (credential_id, kind, actor_id) values (${c.id}, 'downloaded', ${user.id})`);
    await track(user.id, "certificate_downloaded");
    return new NextResponse(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${c.credential_number}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
