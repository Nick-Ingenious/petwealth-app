import "server-only";

/**
 * Local-only sign-in as a fixed customer email, so the portal can be developed
 * without Clerk. Ignored unless NODE_ENV=development and not on Vercel.
 */
export const DEV_BYPASS_CUSTOMER_EMAIL: string | null =
  process.env.NODE_ENV === "development" && !process.env.VERCEL && process.env.AUTH_DEV_BYPASS_CUSTOMER_EMAIL
    ? process.env.AUTH_DEV_BYPASS_CUSTOMER_EMAIL.trim().toLowerCase()
    : null;

export const CLERK_ENABLED = !DEV_BYPASS_CUSTOMER_EMAIL;
