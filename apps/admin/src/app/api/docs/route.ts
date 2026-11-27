import { ApiReference } from "@scalar/nextjs-api-reference";
import { NextResponse, type NextRequest } from "next/server";
import { can } from "@petwealth/api";
import { getStaff } from "@/lib/auth";

const render = ApiReference({ url: "/api/openapi.json", pageTitle: "Petwealth Staff API", theme: "purple" });

/** Interactive API reference (Scalar). "Try it" calls use your staff session. */
export async function GET(req: NextRequest) {
  const staff = await getStaff("api");
  if (!staff) return NextResponse.redirect(new URL("/sign-in", req.url));
  if (!can(staff, "api.access")) return NextResponse.redirect(new URL("/access-denied?need=api.access", req.url));
  return render();
}
