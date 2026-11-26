import { NextResponse, type NextRequest } from "next/server";
import { AppError, getBreedAvatarImage } from "@petwealth/api";
import { getCustomer } from "@/lib/auth";

/** A shared AI breed picture. The URL carries a version, so it can be cached for a long time. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCustomer();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  try {
    const image = await getBreedAvatarImage(id);
    return new NextResponse(new Uint8Array(image.content), {
      headers: {
        "content-type": image.mimeType,
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }
}
