import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Optimistic auth check at the edge of every request: anything that isn't a
 * public route requires a Clerk session. Authorisation (is this an active
 * staff member with permission X?) happens in `requireStaff` / services.
 */
const isPublic = createRouteMatcher(["/sign-in(.*)", "/access-denied", "/api/health"]);

const devBypass =
  process.env.NODE_ENV === "development" && !process.env.VERCEL && Boolean(process.env.AUTH_DEV_BYPASS_EMAIL);

export default devBypass
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (!isPublic(req)) await auth.protect();
    });

export const config = {
  matcher: [
    // Skip Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
