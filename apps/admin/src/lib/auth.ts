import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { can, resolveStaffContext, type StaffContext } from "@petwealth/api";
import type { Permission } from "@petwealth/domain";
import { DEV_BYPASS_EMAIL, STAFF_ALLOWED_DOMAINS } from "./env";

type Via = StaffContext["via"];

/**
 * The signed-in staff member for this request, or null.
 * Memoised per request with React `cache` so layouts and pages share one lookup.
 */
export const getStaff = cache(async (via: Via = "admin_ui"): Promise<StaffContext | null> => {
  if (DEV_BYPASS_EMAIL) {
    return resolveStaffContext({ clerkUserId: null, email: DEV_BYPASS_EMAIL }, { allowedDomains: STAFF_ALLOWED_DOMAINS, via });
  }
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const primary = user?.primaryEmailAddress;
  // Only trust verified addresses (Google sign-in emails are verified by Google).
  if (!primary || primary.verification?.status !== "verified") return null;
  return resolveStaffContext({ clerkUserId: userId, email: primary.emailAddress }, { allowedDomains: STAFF_ALLOWED_DOMAINS, via });
});

/**
 * Gate for every admin page and server action. Redirects to sign-in when there
 * is no session, and to /access-denied when the user isn't active staff or
 * lacks `permission`.
 */
export async function requireStaff(permission?: Permission): Promise<StaffContext> {
  const staff = await getStaff();
  if (!staff) {
    if (!DEV_BYPASS_EMAIL && !(await auth()).userId) redirect("/sign-in" as never);
    redirect("/access-denied");
  }
  if (permission && !can(staff, permission)) redirect(`/access-denied?need=${encodeURIComponent(permission)}`);
  return staff;
}
