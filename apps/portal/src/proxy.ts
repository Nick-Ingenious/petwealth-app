import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { RETURN_URL_HEADER } from "@/lib/return-url";

/**
 * Loads the Clerk session for every request, but doesn't decide access:
 * every page, API route and server action checks it itself
 * (`requireCustomer`, `getCustomer`, `runAction`), as Clerk now recommends.
 * Pages that find no session send the visitor to sign-in and back again,
 * using the path passed along here (so QR deep links survive sign-in).
 */
const devBypass =
  process.env.NODE_ENV === "development" && !process.env.VERCEL && Boolean(process.env.AUTH_DEV_BYPASS_CUSTOMER_EMAIL);

function withReturnUrl(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(RETURN_URL_HEADER, req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

const clerk = clerkMiddleware(async (_auth, req) => withReturnUrl(req));

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (devBypass) return withReturnUrl(req);
  return clerk(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|otf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
