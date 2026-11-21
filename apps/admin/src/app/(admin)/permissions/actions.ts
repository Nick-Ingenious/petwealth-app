"use server";

import { revalidatePath } from "next/cache";
import { setRolePermissions } from "@petwealth/api";
import { runAction, type ActionResult } from "@/lib/action";

export async function saveRolePermissionsAction(changes: { role: string; permissions: string[] }[]): Promise<ActionResult> {
  const result = await runAction(async (staff) => {
    for (const c of changes) await setRolePermissions(staff, c);
  });
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Permissions saved. Changes apply on each user's next request." };
}
