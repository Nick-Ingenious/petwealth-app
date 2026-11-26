/**
 * The proxy passes the requested path (and query) to pages in this header,
 * so a signed-out visitor can be sent to sign-in and brought back to the
 * same page afterwards (e.g. a QR deep link to /register?kit=…).
 */
export const RETURN_URL_HEADER = "x-petwealth-return-url";

/** Same-site paths only: no scheme-relative ("//x") or backslash ("/\x") tricks, and never back to sign-in. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (raw === "/" || raw.startsWith("/sign-in") || raw.startsWith("/sign-up")) return null;
  return raw.slice(0, 2000);
}

/** "/sign-in", or "/sign-in?redirect_url=/kits/CFEC-…" to come back after signing in. */
export function signInPath(returnTo: string | null | undefined): string {
  const back = safeReturnPath(returnTo);
  return back ? `/sign-in?redirect_url=${encodeURIComponent(back)}` : "/sign-in";
}
