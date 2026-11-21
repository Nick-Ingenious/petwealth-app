"use server";

import { revalidatePath } from "next/cache";
import { inviteStaff, updateStaff } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";
import { STAFF_ALLOWED_DOMAINS } from "@/lib/env";

export async function inviteStaffAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction((staff) =>
    inviteStaff(staff, { email: form.get("email"), name: form.get("name") || undefined, role: form.get("role") }, { allowedDomains: STAFF_ALLOWED_DOMAINS }),
  );
  if (!result.ok) return result;
  revalidatePath("/users");
  return { ok: true, data: undefined, message: "Invited. They can now sign in with Google using that address." };
}

export async function updateStaffAction(id: string, patch: { role?: string; status?: "active" | "disabled" }): Promise<ActionResult> {
  const result = await runAction((staff) => updateStaff(staff, id, patch));
  if (!result.ok) return result;
  revalidatePath("/users");
  return { ok: true, data: undefined };
}
