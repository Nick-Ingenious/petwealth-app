"use server";

import { redirect } from "next/navigation";
import { deleteMyAccount } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";
import { CLERK_ENABLED } from "@/lib/env";

export async function deleteAccountAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction((ctx) => deleteMyAccount(ctx, { confirm: String(form.get("confirm") ?? "").trim() }));
  if (!result.ok) return result;
  // Remove the login too, so the old session can't come back.
  if (CLERK_ENABLED && result.data.clerkUserId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      await (await clerkClient()).users.deleteUser(result.data.clerkUserId);
    } catch (e) {
      // The account data is already gone; the login can be removed by staff if this fails.
      console.error("[delete-account] Clerk user deletion failed", e instanceof Error ? e.message : e);
    }
  }
  redirect("/account-deleted");
}
