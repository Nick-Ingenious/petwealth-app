import { NextResponse, type NextRequest } from "next/server";
import { getMyLabReport } from "@petwealth/api";
import { getCustomer } from "@/lib/auth";
import { renderReportPdf } from "@/lib/report-pdf";

/** The signed-in customer's released results for one kit, as a downloadable PDF. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const ctx = await getCustomer();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { code } = await params;
  const report = await getMyLabReport(ctx, decodeURIComponent(code));
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const logoRes = await fetch(new URL("/brand/email-logo.png", req.nextUrl.origin)).catch(() => null);
  const logo = logoRes?.ok ? Buffer.from(await logoRes.arrayBuffer()) : null;
  const pdf = await renderReportPdf(report, logo);
  const pet = (report.petName ?? "Pet").replace(/[^A-Za-z0-9]+/g, "-");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Petwealth-${pet}-${report.kitCode}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
