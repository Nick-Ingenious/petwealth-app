import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/** Everything except sign-in/up requires a customer session; pages re-check via requireCustomer. */
const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/health"]);

const devBypass =
  process.env.NODE_ENV === "development" && !process.env.VERCEL && Boolean(process.env.AUTH_DEV_BYPASS_CUSTOMER_EMAIL);

const clerk = clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (devBypass) return NextResponse.next();
  return clerk(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|otf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
