import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { resolveCustomerContext, type CustomerContext } from "@petwealth/api";
import { DEV_BYPASS_CUSTOMER_EMAIL } from "./env";

/** The signed-in customer for this request (memoised), or null. */
export const getCustomer = cache(async (): Promise<CustomerContext | null> => {
  if (DEV_BYPASS_CUSTOMER_EMAIL) return resolveCustomerContext({ clerkUserId: null, email: DEV_BYPASS_CUSTOMER_EMAIL });
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const primary = user?.primaryEmailAddress;
  // Only verified emails can claim an existing (e.g. Shopify) customer record.
  if (!primary || primary.verification?.status !== "verified") return null;
  return resolveCustomerContext({ clerkUserId: userId, email: primary.emailAddress });
});

/** Pages a customer may be sent back to after onboarding (open-redirect safe). */
export function safeNext(raw: unknown): string {
  // Same-site paths only: no scheme-relative ("//x") or backslash ("/\\x") tricks.
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/register";
}

/**
 * Gate for every signed-in page. New customers go through onboarding first and
 * then come back to `next` — so a QR deep link (/register?kit=…) survives sign-up.
 */
export async function requireCustomer(opts: { allowOnboarding?: boolean; next?: string } = {}): Promise<CustomerContext> {
  const customer = await getCustomer();
  if (!customer) redirect("/sign-in" as never);
  if (customer.needsOnboarding && !opts.allowOnboarding) {
    redirect(`/onboarding${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}` as never);
  }
  return customer;
}
