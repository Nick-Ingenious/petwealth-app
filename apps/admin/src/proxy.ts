import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/**
 * Optimistic auth check at the edge of every request: anything that isn't a
 * public route requires a Clerk session. Authorisation (is this an active
 * staff member with permission X?) happens in `requireStaff` / services.
 */
const isPublic = createRouteMatcher(["/sign-in(.*)", "/access-denied", "/api/health"]);

const devBypass =
  process.env.NODE_ENV === "development" && !process.env.VERCEL && Boolean(process.env.AUTH_DEV_BYPASS_EMAIL);

const clerk = clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  // Webhooks (provider signatures) and crons (CRON_SECRET) authenticate in their
  // own routes, not with staff sessions — so they never touch Clerk and keep
  // working even if Clerk is misconfigured or unavailable.
  // The staff MCP endpoint checks its own OAuth bearer token (Clerk), and the
  // OAuth discovery documents must be readable before sign-in.
  const path = req.nextUrl.pathname;
  if (
    devBypass ||
    path.startsWith("/api/webhooks/") ||
    path.startsWith("/api/cron/") ||
    path === "/api/mcp" ||
    path.startsWith("/.well-known/oauth-")
  ) {
    return NextResponse.next();
  }
  return clerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
