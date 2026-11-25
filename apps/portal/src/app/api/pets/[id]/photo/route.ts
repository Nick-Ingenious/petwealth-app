import { NextResponse, type NextRequest } from "next/server";
import { AppError, getMyPetPhoto } from "@petwealth/api";
import { getCustomer } from "@/lib/auth";

/** The signed-in customer's own pet photo. The URL carries a version, so it can be cached privately. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCustomer();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  try {
    const photo = await getMyPetPhoto(ctx, id);
    return new NextResponse(new Uint8Array(photo.content), {
      headers: {
        "content-type": photo.mimeType,
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }
}
