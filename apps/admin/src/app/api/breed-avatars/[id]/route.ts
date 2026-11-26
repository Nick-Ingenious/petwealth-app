import { NextResponse, type NextRequest } from "next/server";
import { AppError, getBreedAvatarImageForStaff } from "@petwealth/api";
import { getStaff } from "@/lib/auth";

/** An AI breed picture, for the Breed Pictures page. Staff only; the URL carries a version. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff("api");
  if (!staff) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in" } }, { status: 401 });
  const { id } = await params;
  try {
    const image = await getBreedAvatarImageForStaff(staff, id);
    return new NextResponse(new Uint8Array(image.content), {
      headers: {
        "content-type": image.mimeType,
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    throw e;
  }
}
