import { NextResponse, type NextRequest } from "next/server";
import { AppError, getMyMailerLabel } from "@petwealth/api";
import { getCustomer } from "@/lib/auth";

/** The signed-in customer's own FedEx QR code / label. ?download=1 saves it as a file. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCustomer();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const label = await getMyMailerLabel(ctx, id);
    const ext = label.mimeType === "application/pdf" ? "pdf" : "png";
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(label.content), {
      headers: {
        "content-type": label.mimeType,
        "content-disposition": `${download ? "attachment" : "inline"}; filename="PetWealth-FedEx-${label.rmaNumber}.${ext}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }
}
