import "server-only";

/** Email domains allowed into the staff portal (Clerk is also configured to allow only these). */
export const STAFF_ALLOWED_DOMAINS = (process.env.STAFF_ALLOWED_EMAIL_DOMAINS ?? "petwealth.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/**
 * Local-only auth bypass. Signs every request in as a seeded staff user so the
 * app can be developed without Clerk keys. Hard-disabled on Vercel and in any
 * non-development build — there is no way to enable it in production.
 */
export const DEV_BYPASS_EMAIL: string | null =
  process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.AUTH_DEV_BYPASS_EMAIL
    ? process.env.AUTH_DEV_BYPASS_EMAIL.trim().toLowerCase()
    : null;

export const CLERK_ENABLED = !DEV_BYPASS_EMAIL;
