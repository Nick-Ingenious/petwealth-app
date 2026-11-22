import { NextResponse, type NextRequest } from "next/server";
import { AppError, getShipmentLabel } from "@petwealth/api";
import { getStaff } from "@/lib/auth";

/** The stored return QR code (PNG) or label (PDF), shown inline. Staff only; never cached. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff("api");
  if (!staff) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in" } }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: { code: "not_found", message: "Label not found." } }, { status: 404 });
  try {
    const label = await getShipmentLabel(staff, id);
    return new NextResponse(new Uint8Array(label.content), {
      headers: {
        "content-type": label.mimeType,
        "content-disposition": "inline",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    throw e;
  }
}
