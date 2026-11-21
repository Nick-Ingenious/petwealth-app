import { NextResponse, type NextRequest } from "next/server";
import { can } from "@petwealth/api";
import { getOpenApiDocument } from "@petwealth/api/openapi";
import { getStaff } from "@/lib/auth";

/** The OpenAPI 3.1 document. Staff-only: it describes internal endpoints. */
export async function GET(req: NextRequest) {
  const staff = await getStaff("api");
  if (!staff || !can(staff, "api.access")) {
    return NextResponse.json({ error: { code: "forbidden", message: "Staff with API access only." } }, { status: staff ? 403 : 401 });
  }
  return NextResponse.json(getOpenApiDocument(req.nextUrl.origin));
}
