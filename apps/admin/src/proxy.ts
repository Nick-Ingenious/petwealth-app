import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { RETURN_URL_HEADER } from "@/lib/return-url";

/**
 * Loads the Clerk session for every request, but doesn't decide access:
 * every page, API route and server action checks it itself (`requireStaff`,
 * `getStaff`, `apiRoute`, `runAction`), as Clerk now recommends. Pages that
 * find no session send the visitor to sign-in and back again, using the
 * path passed along here.
 */
const devBypass =
  process.env.NODE_ENV === "development" && !process.env.VERCEL && Boolean(process.env.AUTH_DEV_BYPASS_EMAIL);

function withReturnUrl(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(RETURN_URL_HEADER, req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

const clerk = clerkMiddleware(async (_auth, req) => withReturnUrl(req));

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  // Webhooks (provider signatures) and crons (CRON_SECRET) authenticate in their
  // own routes, not with staff sessions — so they never touch Clerk and keep
  // working even if Clerk is misconfigured or unavailable.
  // The staff MCP endpoint checks its own OAuth bearer token (Clerk), and the
  // OAuth discovery documents must be readable before sign-in.
  const path = req.nextUrl.pathname;
  if (devBypass) return withReturnUrl(req);
  if (
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
