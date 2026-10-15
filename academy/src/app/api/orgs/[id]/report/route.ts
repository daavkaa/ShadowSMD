import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { orgReportCsv } from "@/features/organizations/service";
import { uuidLike } from "@/lib/validation";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const orgId = uuidLike.parse((await params).id);
    let csv: string;
    try {
      csv = await orgReportCsv(user.id, orgId);
    } catch (e) {
      if (e instanceof Error && /not_org_manager/.test(e.message)) throw new AppError("forbidden");
      throw e;
    }
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="team-report.csv"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
